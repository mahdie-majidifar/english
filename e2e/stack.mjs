// Starts the same two servers the browser tests use (the test API with the demo AI on port 4100, and the site
// on port 3100) and leaves them running, so a person (or Claude) can click around a throwaway database.
//   pnpm --filter @coach/e2e stack          then open http://localhost:3100 and register
// The API is the built one (`pnpm build` first). Stop with Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dot = {};
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) dot[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const devUrl = process.env.DATABASE_URL ?? dot.DATABASE_URL;
if (!devUrl) throw new Error('DATABASE_URL is needed (set it in .env).');
const db = `${new URL(devUrl).pathname.slice(1)}_e2e`;
const dbUrl = new URL(devUrl);
dbUrl.pathname = `/${db}`;

const apiEnv = {
  ...process.env,
  DATABASE_URL: dbUrl.toString(),
  E2E_ADMIN_DATABASE_URL: devUrl,
  E2E_DB: db,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? dot.JWT_ACCESS_SECRET ?? 'e2e-secret-e2e-secret-e2e-secret-123456',
  API_PORT: '4100',
  WEB_ORIGIN: 'http://localhost:3100',
  AI_PROVIDER: 'mock',
  DISABLE_THROTTLE: '1',
  NODE_ENV: 'development',
  STORAGE_DIR: resolve(root, 'e2e', '.storage'),
};

const children = [
  spawn(process.execPath, ['start-api.mjs'], { cwd: resolve(root, 'e2e'), env: apiEnv, stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'next', 'dev', '--port', '3100'], {
    cwd: resolve(root, 'apps', 'web'),
    env: { ...process.env, API_INTERNAL_URL: 'http://localhost:4100' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];
console.log('\nTest stack: http://localhost:3100  (a fresh database every start; Ctrl+C to stop)\n');

function stop(code = 0) {
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
