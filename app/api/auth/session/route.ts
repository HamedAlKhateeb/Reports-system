import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/server-auth';

/**
 * Phase 1.1 (B3) — Session mint/clear endpoint.
 *
 * POST { idToken } → verifies the Firebase ID token server-side, then sets
 * the `__session` cookie as HttpOnly (+Secure in production, SameSite=Strict).
 * The cookie value is the short-lived ID token itself (1h); the client
 * refreshes it periodically (see AuthProvider).
 *
 * DELETE → clears the session cookie (sign-out).
 */

const COOKIE_NAME = '__session';
const MAX_AGE_SECONDS = 3600; // Upper bound; Firebase ID tokens live ~1 hour.

function tokenRemainingSeconds(idToken: string): number | null {
  // Client already verified server-side — this only sizes Max-Age so the
  // cookie never outlives the JWT it carries. Never throws.
  try {
    const part = idToken.split('.')[1];
    if (!part) return null;
    const norm = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      typeof Buffer !== 'undefined'
        ? Buffer.from(norm, 'base64').toString('utf8')
        : atob(norm)
    ) as { exp?: number };
    if (typeof json.exp !== 'number') return null;
    return json.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

function buildSessionCookie(idToken: string): string {
  const remaining = tokenRemainingSeconds(idToken);
  const maxAge =
    remaining === null ? MAX_AGE_SECONDS : Math.min(Math.max(remaining, 60), MAX_AGE_SECONDS);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(idToken)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    // Lax (not Strict): page-gating cookie must survive top-level navigation
    // from external links (email/WhatsApp) or users look "logged out".
    'SameSite=Lax',
  ];
  // `Secure` would block the cookie on http://localhost dev, so only set it
  // outside development or when explicitly behind https.
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: unknown };
    if (typeof body.idToken !== 'string' || !body.idToken) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Missing idToken.' } },
        { status: 400 }
      );
    }

    const verified = await verifyFirebaseIdToken(body.idToken);
    if (!verified) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ID token.' } },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true, uid: verified.uid });
    // Store the verified ID token (not a raw uid) in the HttpOnly cookie.
    res.headers.set('Set-Cookie', buildSessionCookie(body.idToken));
    res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err?.message || 'Session mint failed.' } },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.headers.set('Set-Cookie', parts.join('; '));
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res;
}
