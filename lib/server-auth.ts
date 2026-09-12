import type { NextRequest } from 'next/server';

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
 * No new dependencies: pure WebCrypto (`crypto.subtle`) + Google's public
 * JWK endpoint — works identically on Node, Cloudflare Workers, and edge
 * runtimes (node:crypto proved unreliable under workers).
 */

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function getProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    'myreports-system'
  );
}

interface CachedKeys {
  expiresAt: number;
  keys: Map<string, CryptoKey>;
}

let keyCache: CachedKeys | null = null;

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  // Buffer (Node) or atob (edge) — both yield identical bytes.
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlToText(input: string): string {
  const bytes = base64UrlToBytes(input);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}

function subtle(): SubtleCrypto {
  const c: any = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto subtle unavailable');
  return c.subtle as SubtleCrypto;
}

async function getGoogleKey(kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  const cached = keyCache && keyCache.expiresAt > now ? keyCache.keys.get(kid) : undefined;
  if (cached) return cached;

  const res = await fetch(GOOGLE_JWKS_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google JWKS: ${res.status}`);
  }
  const jwks = (await res.json()) as { keys?: Array<any> };
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error('Malformed Google JWKS');
  }

  // Respect Cache-Control: max-age when present, default 1h, cap 6h.
  let maxAgeSec = 3600;
  const cacheControl = res.headers.get('cache-control') || '';
  const match = cacheControl.match(/max-age=(\d+)/);
  if (match) {
    maxAgeSec = Math.min(Math.max(parseInt(match[1], 10), 300), 21600);
  }

  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys) {
    if (!jwk?.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
    try {
      const key = await subtle().importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true } as any,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(String(jwk.kid), key);
    } catch {
      // Skip unusable keys; others may still verify.
    }
  }
  keyCache = { expiresAt: now + maxAgeSec * 1000, keys };
  return keys.get(kid) || null;
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
    const header = JSON.parse(base64UrlToText(headerB64)) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) return null;

    const key = await getGoogleKey(header.kid);
    if (!key) return null;

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const valid = await subtle().verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(signatureB64) as BufferSource,
      data
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlToText(payloadB64)) as {
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
  } catch (err) {
    // Any parsing/network/crypto failure → unauthenticated. Fail closed.
    // Logged server-side so production failures stay diagnosable.
    try {
      console.error('[server-auth] verify failed:', err instanceof Error ? err.message : err);
    } catch {}
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
