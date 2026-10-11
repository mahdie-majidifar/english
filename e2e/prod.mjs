// Runs the browser tests against the built site, the way it really runs (`pnpm e2e:prod`).
// The strict Content-Security-Policy and the per-request rendering only exist there, not under `next dev`.
// The site is built into its own folder (.next-e2e) because Next fixes the API address into the build:
// this build talks to the test API on port 4100 and never touches the normal `.next` build.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args, cwd, env = {}) =>
  spawnSync('pnpm', args, { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...env } }).status ?? 1;

const env = { API_INTERNAL_URL: 'http://localhost:4100', NEXT_DIST_DIR: '.next-e2e' };

let status = run(['exec', 'next', 'build'], resolve(root, 'apps', 'web'), env);
// `next build` points next-env.d.ts at the folder it built into; put it back so the working tree stays clean.
spawnSync('git', ['checkout', '--', 'apps/web/next-env.d.ts'], { cwd: root, stdio: 'ignore' });
if (status === 0) status = run(['exec', 'playwright', 'test', ...process.argv.slice(2)], resolve(root, 'e2e'), { ...env, E2E_PROD: '1' });
process.exit(status);
