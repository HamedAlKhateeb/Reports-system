import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Phase 1.1 (B3): the `__session` cookie now holds a Firebase ID token
  // (JWT, HttpOnly, set by /api/auth/session after server-side verification),
  // NOT a raw uid. Edge middleware cannot verify RS256 cheaply, so this check
  // is UX-only page gating: JWT-shaped cookies and the guest marker
  // (`__session_local=guest`, no identity) pass through; legacy raw-uid
  // cookies are treated as absent (→ redirect to /login, re-login mints a
  // proper session). Real enforcement happens per API route via
  // getVerifiedSessionUid() + Firestore/Storage rules — a forged cookie
  // yields 401 / denied reads even if this gate ever let it through.
  const session = request.cookies.get('__session')?.value;
  const localMarker = request.cookies.get('__session_local')?.value;
  const hasSessionCookie =
    Boolean(session && session.split('.').length === 3) ||
    localMarker === 'guest';

  // Public paths
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/');

  // API paths: ensure Cache-Control: private, no-store
  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  // Protected paths
  const isProtectedPath =
    pathname.startsWith('/projects') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/boards') ||
    pathname.startsWith('/issues') ||
    pathname.startsWith('/settings') ||
    pathname === '/';

  // Root path instant redirect — skips client spinner roundtrip
  if (pathname === '/') {
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL('/projects', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // If visiting protected page without session, redirect to /login.
  // `reason=invalid-session` marks the case where a cookie EXISTED but was
  // malformed/legacy (e.g. server-session mint failed) so /login can explain
  // instead of silently bouncing.
  if (isProtectedPath && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    if (session && session.split('.').length !== 3) {
      loginUrl.searchParams.set('reason', 'invalid-session');
    }
    const redirectResponse = NextResponse.redirect(loginUrl);
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    redirectResponse.headers.set('Pragma', 'no-cache');
    return redirectResponse;
  }

  // If already logged in and visiting /login, redirect to /reports
  if (isPublicPath && hasSessionCookie) {
    const redirectResponse = NextResponse.redirect(new URL('/reports', request.url));
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    redirectResponse.headers.set('Pragma', 'no-cache');
    return redirectResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
