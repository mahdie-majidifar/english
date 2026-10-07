import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const problem = (status: number, code: string) => json(status, { type: 't', title: 'x', status, code });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn(async () => responses.shift() ?? json(500));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const urls = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => String(c[0]));

afterEach(() => vi.unstubAllGlobals());

describe('api client session handling', () => {
  it('silently refreshes an expired session and retries, also for /auth/me', async () => {
    const fn = mockFetch(problem(401, 'UNAUTHENTICATED'), json(200, { user: {} }), json(200, { user: { id: '1' } }));
    const result = await api<{ user: { id: string } }>('/auth/me');
    expect(result.user.id).toBe('1');
    expect(urls(fn)).toEqual(['/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me']);
  });

  it('does not try to refresh when logging in with a wrong password', async () => {
    const fn = mockFetch(problem(401, 'INVALID_CREDENTIALS'));
    await expect(api('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(urls(fn)).toEqual(['/api/v1/auth/login']);
  });

  it('gives up when the refresh itself fails, and reports the original 401', async () => {
    const fn = mockFetch(problem(401, 'UNAUTHENTICATED'), problem(401, 'UNAUTHENTICATED'));
    await expect(api('/items')).rejects.toMatchObject({ status: 401 });
    expect(urls(fn)).toEqual(['/api/v1/items', '/api/v1/auth/refresh']);
  });

  it('refreshes only once when several requests expire together', async () => {
    const fn = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return json(200, {});
      return fn.mock.calls.filter((c) => c[0] === url).length <= 1 ? problem(401, 'UNAUTHENTICATED') : json(200, { ok: url });
    });
    vi.stubGlobal('fetch', fn);
    await Promise.all([api('/items'), api('/books'), api('/me/current')]);
    expect(urls(fn).filter((u) => u.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('sends JSON for objects and leaves FormData alone', async () => {
    const fn = mockFetch(json(200, {}), json(200, {}));
    await api('/x', { method: 'POST', body: { a: 1 } });
    const form = new FormData();
    form.set('file', 'data');
    await api('/y', { method: 'POST', body: form });
    const [jsonCall, formCall] = fn.mock.calls as unknown as [string, RequestInit][][];
    expect((jsonCall as unknown as [string, RequestInit])[1].body).toBe('{"a":1}');
    expect(((jsonCall as unknown as [string, RequestInit])[1].headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((formCall as unknown as [string, RequestInit])[1].body).toBeInstanceOf(FormData);
    expect((formCall as unknown as [string, RequestInit])[1].headers).toBeUndefined();
  });

  it('turns problem+json errors into ApiError with the code', async () => {
    mockFetch(problem(409, 'CONFLICT'));
    const error = (await api('/items', { method: 'POST', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('CONFLICT');
  });

  it('copes with a non-JSON error page (API down behind the proxy)', async () => {
    mockFetch(new Response('Bad gateway', { status: 502 }));
    const error = (await api('/items').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
  });

  it('returns undefined for 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    expect(await api('/books/1', { method: 'DELETE' })).toBeUndefined();
  });
});
