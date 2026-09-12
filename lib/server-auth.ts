import type { NextRequest } from 'next/server';
import { createVerify } from 'node:crypto';

/**
 * Phase 1.1 (B3) — Server-side session verification.
 *
 * The old flow trusted the raw `__session` cookie value as a uid
 * (`document.cookie = "__session=" + uid`), so anyone could forge any uid.
 * The new flow stores the Firebase Auth **ID token** (short-lived JWT signed
 * by Google) in the `__session` HttpOnly cookie, and every privileged API
 * route verifies its signature + audience + expiry here before trusting `sub`
 * as the uid.
 *
 * No new dependencies: verification uses `node:crypto` + the public Google
 * cert endpoint, with an in-memory cert cache.
 */

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function getProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    'myreports-system'
  );
}

interface CachedCerts {
  expiresAt: number;
  certs: Record<string, string>;
}

let certCache: CachedCerts | null = null;

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

async function getGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) return certCache.certs;

  const res = await fetch(GOOGLE_CERTS_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google certs: ${res.status}`);
  }
  const certs = (await res.json()) as Record<string, string>;

  // Respect Cache-Control: max-age when present, default 1h, cap 6h.
  let maxAgeSec = 3600;
  const cacheControl = res.headers.get('cache-control') || '';
  const match = cacheControl.match(/max-age=(\d+)/);
  if (match) {
    maxAgeSec = Math.min(Math.max(parseInt(match[1], 10), 300), 21600);
  }
  certCache = { expiresAt: now + maxAgeSec * 1000, certs };
  return certs;
}

export interface VerifiedSession {
  uid: string;
  /** Lowercase verified email (may be '' when the provider omits it). */
  email: string;
}

/**
 * Verifies a Firebase Auth ID token and returns the uid (`sub`).
 * Returns null for any invalid/expired/forged token — fail closed.
 */
export async function verifyFirebaseIdToken(
  idToken: string | null | undefined
): Promise<VerifiedSession | null> {
  try {
    if (!idToken || typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) return null;

    const certs = await getGoogleCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const valid = verifier.verify(cert, base64UrlDecode(signatureB64));
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      email?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
    };

    const projectId = getProjectId();
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    // 60s clock skew tolerance.
    if (typeof payload.iat === 'number' && payload.iat > nowSec + 60) return null;
    if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 60) {
      return null;
    }

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
    };
  } catch {
    // Any parsing/network/crypto failure → unauthenticated. Fail closed.
    return null;
  }
}

/** Returns true for guest/local marker cookies that carry no identity. */
export function isGuestSessionMarker(value: string | null | undefined): boolean {
  return value === 'guest';
}

/**
 * Returns the verified Firebase session (uid + email) for this request.
 * Reads ONLY the `__session` cookie (expected: Firebase ID token).
 * Raw-uid legacy cookies (no dots) and guest markers are rejected here —
 * guests/local users are intentionally server-anonymous (localStorage only).
 */
export async function getVerifiedSession(
  req: NextRequest
): Promise<VerifiedSession | null> {
  const session = req.cookies.get('__session')?.value;
  if (!session) return null;
  if (isGuestSessionMarker(session)) return null;
  if (session.split('.').length !== 3) return null; // legacy raw-uid → reject
  return verifyFirebaseIdToken(session);
}

/**
 * Returns the verified Firebase uid for this request, or null.
 * (Thin wrapper kept for existing callers that only need the uid.)
 */
export async function getVerifiedSessionUid(
  req: NextRequest
): Promise<string | null> {
  const verified = await getVerifiedSession(req);
  return verified?.uid ?? null;
}
