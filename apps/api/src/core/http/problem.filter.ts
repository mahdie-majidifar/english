import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorCode, ProblemDetails } from '@coach/contracts';
import { DomainError } from './domain-error.js';

const TITLES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The request is not valid',
  UNAUTHENTICATED: 'Authentication required',
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_REUSED: 'Session is no longer valid',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  RATE_LIMITED: 'Too many requests',
  AI_NOT_CONFIGURED: 'AI is not set up',
  AI_UNAVAILABLE: 'AI is unavailable right now',
  INTERNAL: 'Something went wrong',
};

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return 'VALIDATION_FAILED';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}

/** Renders every error as RFC 9457 problem details (application/problem+json). */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = (res.locals['traceId'] as string | undefined) ?? undefined;

    let status = 500;
    let code: ErrorCode = 'INTERNAL';
    let detail: string | undefined;
    let errors: ProblemDetails['errors'];

    if (exception instanceof DomainError) {
      status = exception.getStatus();
      code = exception.code;
      detail = exception.detail;
      errors = exception.errors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeForStatus(status);
      // Framework messages (e.g. "Cannot GET /x") are safe to show.
      detail = status < 500 ? exception.message : undefined;
    } else {
      this.logger.error(
        `Unhandled error${traceId ? ` [${traceId}]` : ''}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ProblemDetails = {
      type: `https://errors.coach.local/${code.toLowerCase().replaceAll('_', '-')}`,
      title: TITLES[code],
      status,
      code,
      ...(detail ? { detail } : {}),
      ...(traceId ? { traceId } : {}),
      ...(errors?.length ? { errors } : {}),
    };

    res.status(status).type('application/problem+json').json(body);
  }
}
