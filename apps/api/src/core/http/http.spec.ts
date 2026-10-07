import { HttpException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError } from './domain-error.js';
import { ProblemFilter, codeForStatus } from './problem.filter.js';
import { originCheck } from './request-context.middleware.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

function fakeResponse() {
  const res = {
    locals: { traceId: 'trace-1' } as Record<string, unknown>,
    statusCode: 0,
    contentType: '',
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type(t: string) {
      this.contentType = t;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res;
}

function run(filter: ProblemFilter, exception: unknown) {
  const res = fakeResponse();
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  filter.catch(exception, host as never);
  return res;
}

describe('ProblemFilter', () => {
  const filter = new ProblemFilter();

  it('renders DomainError with its stable code', () => {
    const res = run(filter, new DomainError('NOT_FOUND', 404, 'No such item.'));
    expect(res.statusCode).toBe(404);
    expect(res.contentType).toBe('application/problem+json');
    expect(res.body).toMatchObject({ code: 'NOT_FOUND', status: 404, detail: 'No such item.', traceId: 'trace-1' });
  });

  it('maps framework exceptions by status', () => {
    const res = run(filter, new HttpException('Too Many Requests', 429));
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('hides internals of unexpected errors', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = run(filter, new Error('connection string postgres://secret'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body).toMatchObject({ code: 'INTERNAL' });
  });

  it('maps status codes', () => {
    expect(codeForStatus(401)).toBe('UNAUTHENTICATED');
    expect(codeForStatus(502)).toBe('INTERNAL');
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ email: z.email(), n: z.number().int() }));

  it('returns parsed data', () => {
    expect(pipe.transform({ email: 'a@b.co', n: 2 })).toEqual({ email: 'a@b.co', n: 2 });
  });

  it('throws VALIDATION_FAILED with per-field errors', () => {
    try {
      pipe.transform({ email: 'nope', n: 1.5 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      const err = e as DomainError;
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.getStatus()).toBe(400);
      expect(err.errors?.map((x) => x.path).sort()).toEqual(['email', 'n']);
    }
  });
});

describe('originCheck', () => {
  const check = originCheck(['http://localhost:3000']);
  const call = (method: string, origin?: string) => {
    const res = fakeResponse();
    const next = vi.fn();
    check({ method, headers: origin ? { origin } : {} } as never, res as never, next);
    return { res, next };
  };

  it('allows safe methods from anywhere', () => {
    expect(call('GET', 'https://evil.example').next).toHaveBeenCalled();
  });

  it('allows the web origin and origin-less clients', () => {
    expect(call('POST', 'http://localhost:3000').next).toHaveBeenCalled();
    expect(call('POST').next).toHaveBeenCalled();
  });

  it('blocks state-changing requests from other origins', () => {
    const { res, next } = call('POST', 'https://evil.example');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
