import type { NextConfig } from 'next';

// The browser only ever talks to this origin. `/api/*` is proxied to NestJS, so auth cookies
// stay same-origin (no CORS, no third-party-cookie problems) and provider keys never reach the client.
const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Sent with every page. The Content-Security-Policy is built per request (it needs a nonce): see src/proxy.ts. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // The browser tests build the site into a folder of its own (see e2e/prod.mjs).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
