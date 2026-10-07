import { ApiError } from './api';

/** A short, human message for any failed request. Never shows stack traces or raw server text. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT' || error.code === 'NOT_FOUND') return error.message;
    if (error.code === 'VALIDATION_FAILED') return error.problem?.errors?.[0]?.message ?? 'Please check the highlighted fields.';
    if (error.code === 'RATE_LIMITED') return 'Too many requests. Please wait a moment.';
    if (error.status === 0 || error.status >= 500) return 'We could not reach the server. Please try again.';
  }
  return fallback;
}

/** Field-level messages from a validation error, keyed by the server's field path. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return {};
  const out: Record<string, string> = {};
  for (const e of error.problem?.errors ?? []) out[e.path] ??= e.message;
  return out;
}
