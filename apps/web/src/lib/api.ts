import { ProblemDetailsSchema, type ProblemDetails } from '@coach/contracts';

/** A failed API call, carrying the server's problem+json when there was one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem?: ProblemDetails,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }

  get code() {
    return this.problem?.code;
  }
}

const BASE = '/api/v1';

async function toError(res: Response): Promise<ApiError> {
  try {
    const parsed = ProblemDetailsSchema.safeParse(await res.json());
    if (parsed.success) return new ApiError(res.status, parsed.data);
  } catch {
    // Not JSON (e.g. the API is down and the proxy answered). Fall through.
  }
  return new ApiError(res.status);
}

const SESSION_ENDPOINTS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

/** Rotates the session once, even if several requests hit an expired access token at the same time. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** A plain object is sent as JSON; a FormData is sent as multipart (file uploads). */
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const doFetch = () =>
    fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      // For FormData the browser sets the multipart boundary itself.
      headers: options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    });

  let res = await doFetch();
  // Only the calls that create or end a session skip the silent refresh. /auth/me must not:
  // it is how a returning learner (whose access cookie has expired) gets their session back.
  const skipRefresh = SESSION_ENDPOINTS.has(path);
  if (res.status === 401 && !skipRefresh && (await refreshSession())) {
    res = await doFetch();
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A file the server sends back (the data export), with the name the server chose. */
export async function apiFile(path: string): Promise<{ blob: Blob; filename: string }> {
  const doFetch = () => fetch(`${BASE}${path}`, { credentials: 'same-origin' });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (!res.ok) throw await toError(res);
  const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), filename: named?.[1] ?? 'download' };
}
