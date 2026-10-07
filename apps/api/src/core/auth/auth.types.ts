import type { Role } from '@coach/contracts';

/** Identity attached to a request after the access token is verified. */
export interface RequestUser {
  id: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser;
  }
}

export const ACCESS_COOKIE = 'ec_at';
export const REFRESH_COOKIE = 'ec_rt';
/**
 * Non-secret marker that lives as long as the refresh token. The web proxy uses it to decide
 * "has a session" (the access cookie expires after minutes, long before the refresh token).
 */
export const SESSION_COOKIE = 'ec_s';
/** The refresh cookie is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
