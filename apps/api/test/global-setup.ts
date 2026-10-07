import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { loadRootEnv } from '../src/core/config/load-env.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection string of the throwaway integration-test database, or '' when none is reachable. */
    testDatabaseUrl: string;
  }
}

/**
 * Integration tests run against a real PostgreSQL database named `<dev db>_test`
 * (created and migrated here), never against the development data.
 * If PostgreSQL is not reachable the suites skip themselves instead of failing.
 */
export default async function setup(project: TestProject): Promise<void> {
  loadRootEnv();
  const devUrl = process.env['DATABASE_URL'];
  if (!devUrl) return void project.provide('testDatabaseUrl', '');

  const url = new URL(devUrl);
  const testDb = `${url.pathname.slice(1)}_test`;
  const testUrl = new URL(devUrl);
  testUrl.pathname = `/${testDb}`;

  const admin = new pg.Client({ connectionString: devUrl });
  try {
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testDb}" ENCODING 'UTF8'`);
  } catch (error) {
    console.warn(`[tests] PostgreSQL not reachable, integration suites will be skipped: ${String(error)}`);
    return void project.provide('testDatabaseUrl', '');
  } finally {
    await admin.end().catch(() => undefined);
  }

  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: 'pipe',
  });

  project.provide('testDatabaseUrl', testUrl.toString());
}
