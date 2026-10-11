import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads the repo's `.env`. Real environment variables win over it, like in the app. */
function readDotEnv(): Record<string, string> {
  const file = resolve(root, '.env');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

const dot = readDotEnv();
const pick = (name: string) => process.env[name] ?? dot[name];

export const API_PORT = 4100;
export const WEB_PORT = 3100;

const devUrl = pick('DATABASE_URL');
if (!devUrl) throw new Error('DATABASE_URL is needed (set it in .env) so the E2E database can be created next to it.');

/** The tests get their own database, so they can never touch the learner's real data. */
const e2eUrl = new URL(devUrl);
export const E2E_DB = `${e2eUrl.pathname.slice(1)}_e2e`;
e2eUrl.pathname = `/${E2E_DB}`;

export const ADMIN_DATABASE_URL = devUrl;
export const E2E_DATABASE_URL = e2eUrl.toString();

/** What the API under test runs with. The AI is the built-in demo one: no key, no network, no cost. */
export const apiEnv: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  JWT_ACCESS_SECRET: pick('JWT_ACCESS_SECRET') ?? 'e2e-secret-e2e-secret-e2e-secret-123456',
  API_PORT: String(API_PORT),
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
  AI_PROVIDER: 'mock',
  DISABLE_THROTTLE: '1',
  NODE_ENV: 'development',
  STORAGE_DIR: resolve(root, 'e2e', '.storage'),
};
