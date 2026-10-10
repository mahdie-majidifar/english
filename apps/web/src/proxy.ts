import { NextResponse, type NextRequest } from 'next/server';

// Fast, cookie-presence redirect only. Real authentication happens in NestJS on every API call.
const SESSION_COOKIE = 'ec_s';

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login' || pathname === '/register';

  if (!hasSession && !isLogin) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
