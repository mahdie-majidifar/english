import type { NextConfig } from 'next';

// The browser only ever talks to this origin. `/api/*` is proxied to NestJS, so auth cookies
// stay same-origin (no CORS, no third-party-cookie problems) and provider keys never reach the client.
const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
