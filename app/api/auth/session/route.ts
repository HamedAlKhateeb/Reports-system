import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/server-auth';
import { checkRateLimit } from '@/lib/rate-limit';

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
const MAX_AGE_SECONDS = 604800; // 7 days — matches guest cookie lifetime; client re-mints every 30 min

function buildSessionCookie(idToken: string): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(idToken)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
    const rateLimit = checkRateLimit(`auth_session_${ip}`, 30, 60 * 1000);
    if (!rateLimit.allowed) {
      return rateLimit.response!;
    }
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
