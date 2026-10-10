import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { findRepoRoot } from './load-env.js';

/** `KEY=` in a .env file is an empty string; treat it as "not set". */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Where uploaded teacher files are kept. Defaults to `<repo>/storage`. */
  STORAGE_DIR: optionalString,

  /** mock runs a tiny local stand-in for the model (no key, no network). Never chosen automatically. */
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['openai', 'mock']).optional()),

  /** Anyone can create an account. Switch off (false) to close sign-ups, e.g. on a shared server. */
  ALLOW_REGISTRATION: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).default('true')).transform((v) => v === 'true'),

  /** AI is optional: without a key everything works except automatic analysis of teacher notes. */
  OPENAI_API_KEY: optionalString,
  /** Point this at a proxy or compatible gateway if api.openai.com is not directly reachable. */
  OPENAI_BASE_URL: optionalString,
  /** Model used to read teacher material. Change it here, not in code. */
  AI_MODEL_PARSE: z.string().default('gpt-4o-mini'),
  /** Model that judges free-text answers. Falls back to AI_MODEL_PARSE. */
  AI_MODEL_EVALUATE: optionalString,
  /** Model that writes extra practice exercises. Falls back to AI_MODEL_PARSE. */
  AI_MODEL_GENERATE: optionalString,
  /** Hard ceiling on AI calls per learner per day, so a bug can never run up a bill. */
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

/** Validated, typed environment. Injected wherever configuration is needed. */
@Injectable()
export class AppConfig {
  readonly env: Env = parseEnv();

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Browser origins allowed to make state-changing requests. */
  get webOrigins(): string[] {
    return this.env.WEB_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  get storageDir(): string {
    if (this.env.STORAGE_DIR) return resolve(this.env.STORAGE_DIR);
    return resolve(findRepoRoot() ?? process.cwd(), 'storage');
  }
}
