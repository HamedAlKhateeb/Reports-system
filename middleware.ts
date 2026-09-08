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

  const session = request.cookies.get('__session')?.value;

  // Public paths
  const isPublicPath = pathname === '/login';

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
    pathname.startsWith('/reports') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/issues') ||
    pathname.startsWith('/settings') ||
    pathname === '/';

  // If visiting protected page without session, redirect to /login
  if (isProtectedPath && !session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    redirectResponse.headers.set('Pragma', 'no-cache');
    return redirectResponse;
  }

  // If already logged in and visiting /login, redirect to /reports
  if (isPublicPath && session) {
    const redirectResponse = NextResponse.redirect(new URL('/reports', request.url));
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    redirectResponse.headers.set('Pragma', 'no-cache');
    return redirectResponse;
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
