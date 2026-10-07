import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo root: the nearest parent directory containing `pnpm-workspace.yaml`. */
export function findRepoRoot(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  // Runs from apps/api/src/core/config (dev, tests) or apps/api/dist/core/config (built).
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Loads the monorepo-root `.env` (if present) into process.env.
 * Real environment variables always win, so production can inject them directly.
 */
export function loadRootEnv(): void {
  const root = findRepoRoot();
  if (!root) return;
  const file = resolve(root, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
