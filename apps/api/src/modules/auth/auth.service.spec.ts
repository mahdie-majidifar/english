import { describe, expect, it } from 'vitest';
import { hashToken, normalizeEmail } from './auth.service.js';

describe('auth helpers', () => {
  it('hashes refresh tokens deterministically and never returns the raw token', () => {
    const raw = 'abc123';
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).toHaveLength(64);
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('normalizes emails', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com');
  });
});
