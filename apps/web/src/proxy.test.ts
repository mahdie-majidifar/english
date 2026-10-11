import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './proxy';

const directive = (policy: string, name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('lets only scripts with this request’s nonce run', () => {
    const policy = contentSecurityPolicy('abc123', false);
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('allows eval only in development', () => {
    expect(contentSecurityPolicy('n', true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy('n', false)).not.toContain("'unsafe-eval'");
  });

  it('keeps everything else on this origin and blocks framing, plugins and foreign forms', () => {
    const policy = contentSecurityPolicy('n', false);
    expect(directive(policy, 'default-src')).toBe("default-src 'self'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
  });
});
