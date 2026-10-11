// Runs the browser tests where you can see them: a real window, every click slowed down.
//   pnpm e2e:watch
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['exec', 'playwright', 'test', '--headed', '--project=desktop', '--workers=1'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, E2E_SLOWMO: process.env.E2E_SLOWMO ?? '450' },
});
process.exit(result.status ?? 1);
