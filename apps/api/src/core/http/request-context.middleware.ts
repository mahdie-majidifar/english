import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Assigns a trace id to every request and exposes it as `X-Request-Id`. */
export function requestId() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const traceId = randomUUID();
    res.locals['traceId'] = traceId;
    res.setHeader('X-Request-Id', traceId);
    next();
  };
}

/**
 * CSRF defense for cookie auth (in addition to SameSite=Lax):
 * browsers always send `Origin` on state-changing requests, so a mismatching origin is rejected.
 * Requests without `Origin` (curl, server-to-server) are not browser-driven CSRF vectors.
 */
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) {
      next();
      return;
    }
    res
      .status(403)
      .type('application/problem+json')
      .json({
        type: 'https://errors.coach.local/forbidden',
        title: 'Access denied',
        status: 403,
        code: 'FORBIDDEN',
        detail: 'Cross-origin request blocked.',
        traceId: res.locals['traceId'],
      });
  };
}
