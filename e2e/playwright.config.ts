import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { ADMIN_DATABASE_URL, API_PORT, E2E_DB, WEB_PORT, apiEnv, root } from './env';

const webOrigin = `http://localhost:${WEB_PORT}`;

/**
 * Drives the real app in a real browser: the built API and the Next.js site, on their own ports
 * and their own database (see start-api.mjs), with the demo AI. Run with `pnpm e2e` after `pnpm build`.
 */
export default defineConfig({
  testDir: './tests',
  // One learner's story, step by step: the steps depend on each other.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    // `pnpm e2e:watch` slows every click down so a person can follow along.
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', testMatch: /(journey|security)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'phone', testMatch: /phone\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node start-api.mjs',
      cwd: resolve(root, 'e2e'),
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { ...apiEnv, E2E_ADMIN_DATABASE_URL: ADMIN_DATABASE_URL, E2E_DB },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // `pnpm e2e:prod` (E2E_PROD=1) tests the built site, the way it really runs: the strict Content-Security-Policy only applies there.
      command: process.env.E2E_PROD ? `pnpm exec next start --port ${WEB_PORT}` : `pnpm exec next dev --port ${WEB_PORT}`,
      cwd: resolve(root, 'apps', 'web'),
      url: `${webOrigin}/login`,
      env: { API_INTERNAL_URL: `http://localhost:${API_PORT}`, ...(process.env.E2E_PROD ? { NEXT_DIST_DIR: '.next-e2e' } : {}) },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
