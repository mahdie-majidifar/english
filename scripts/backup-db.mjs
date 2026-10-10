// Saves a copy of the database to backups/coach-<date>-<time>.dump (kept: the newest 14).
//
//   pnpm backup
//
// Restore one with:  pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL>" backups/<file>.dump
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = 14;

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = join(root, '.env');
  if (!existsSync(file)) throw new Error('No .env file and no DATABASE_URL: nothing to back up.');
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is not set in .env.');
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}

/** pg_dump on the PATH, or in the usual Windows install folder. */
function findPgDump() {
  const probe = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'pg_dump';
  const base = 'C:\\Program Files\\PostgreSQL';
  if (existsSync(base)) {
    const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a));
    for (const v of versions) {
      const exe = join(base, v, 'bin', 'pg_dump.exe');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('pg_dump was not found. Install the PostgreSQL command line tools or add them to PATH.');
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dir = join(root, 'backups');
mkdirSync(dir, { recursive: true });
const file = join(dir, `coach-${stamp}.dump`);

// The schema parameter of the URL is Prisma's, not PostgreSQL's.
const url = new URL(databaseUrl());
url.searchParams.delete('schema');

const result = spawnSync(findPgDump(), ['--format=custom', '--no-owner', `--file=${file}`, url.toString()], { encoding: 'utf8' });
if (result.status !== 0) {
  rmSync(file, { force: true });
  console.error(result.stderr || 'pg_dump failed.');
  process.exit(1);
}

// Keep the newest copies only.
const old = readdirSync(dir)
  .filter((f) => f.startsWith('coach-') && f.endsWith('.dump'))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(KEEP);
for (const { f } of old) rmSync(join(dir, f), { force: true });

console.log(`Saved ${file} (${(statSync(file).size / 1024).toFixed(0)} KB). Kept the newest ${KEEP}.`);
