import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@coach/contracts';

/** Expected, business-level failure. Rendered as problem+json with a stable `code`. */
export class DomainError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    readonly detail?: string,
    readonly errors?: { path: string; message: string }[],
  ) {
    super(detail ?? code, status);
  }
}

export const unauthenticated = (detail = 'Authentication required.') =>
  new DomainError('UNAUTHENTICATED', 401, detail);

export const invalidCredentials = () =>
  new DomainError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');

export const notFound = (detail = 'Resource not found.') => new DomainError('NOT_FOUND', 404, detail);

export const forbidden = (detail = 'You do not have access to this resource.') =>
  new DomainError('FORBIDDEN', 403, detail);
