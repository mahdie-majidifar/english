// Starts the API for the end-to-end tests on a fresh, fully migrated database of its own.
// (Playwright starts web servers before its global setup, so the preparation has to live here.)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'apps', 'api');
const { DATABASE_URL, E2E_ADMIN_DATABASE_URL, E2E_DB } = process.env;
if (!DATABASE_URL || !E2E_ADMIN_DATABASE_URL || !E2E_DB) throw new Error('E2E database settings are missing.');

const admin = new pg.Client({ connectionString: E2E_ADMIN_DATABASE_URL });
await admin.connect();
try {
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [E2E_DB]);
  await admin.query(`DROP DATABASE IF EXISTS "${E2E_DB}"`);
  await admin.query(`CREATE DATABASE "${E2E_DB}" ENCODING 'UTF8'`);
} finally {
  await admin.end();
}

const prismaCli = createRequire(resolve(apiDir, 'package.json')).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: apiDir, env: process.env, stdio: 'pipe' });

await import(pathToFileURL(resolve(apiDir, 'dist', 'main.js')).href);
