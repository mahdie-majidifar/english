import { NextResponse, type NextRequest } from 'next/server';

// Fast, cookie-presence redirect only. Real authentication happens in NestJS on every API call.
const SESSION_COOKIE = 'ec_s';

/**
 * The Content-Security-Policy of one page view. Scripts run only if they carry this request's nonce
 * (Next adds it to its own inline scripts and bundles; `strict-dynamic` lets those load the rest), so an
 * injected `<script>` never runs. Styles keep `'unsafe-inline'` because React sets `style="..."` attributes
 * that a nonce cannot cover; a stylesheet cannot run code, so that is the smaller risk.
 */
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // React rebuilds server stack traces with eval in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The browser only talks to this origin: `/api/*` is proxied to NestJS.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

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

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  // Next reads the nonce from the request's policy while it renders the page.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt)$).*)'],
};
