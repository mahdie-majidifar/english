import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/coach',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.ACCESS_TOKEN_TTL_MIN).toBe(15);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces numeric strings', () => {
    expect(parseEnv({ ...valid, API_PORT: '5001' }).API_PORT).toBe(5001);
  });

  it('treats empty optional values from a copied .env.example as not set', () => {
    const env = parseEnv({ ...valid, OPENAI_API_KEY: '', OPENAI_BASE_URL: '', STORAGE_DIR: '', AI_PROVIDER: '' });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.AI_PROVIDER).toBeUndefined();
    expect(env.STORAGE_DIR).toBeUndefined();
    expect(env.AI_MODEL_PARSE).toBe('gpt-4o-mini');
  });

  it('only accepts known AI providers', () => {
    expect(parseEnv({ ...valid, AI_PROVIDER: 'mock' }).AI_PROVIDER).toBe('mock');
    expect(() => parseEnv({ ...valid, AI_PROVIDER: 'skynet' })).toThrow(/AI_PROVIDER/);
  });

  it('rejects a weak JWT secret with a readable message', () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
  });
});
