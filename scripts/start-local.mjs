// Builds the app, brings the database up to date, and starts the API and the website.
//
//   pnpm start:local            build, migrate, start
//   pnpm start:local --no-build start what was built last time
//
// Open http://localhost:3000. Stop with Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipBuild = process.argv.includes('--no-build');
const shell = process.platform === 'win32';

if (!existsSync(join(root, '.env'))) {
  console.error('There is no .env file. Copy .env.example to .env and fill it in first.');
  process.exit(1);
}

function envValue(name) {
  const line = readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

function run(label, command, args, cwd = root) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

if (!skipBuild) run('Building', 'pnpm', ['turbo', 'run', 'build']);
run('Updating the database', 'pnpm', ['exec', 'prisma', 'migrate', 'deploy'], join(root, 'apps', 'api'));

const key = envValue('OPENAI_API_KEY');
const provider = envValue('AI_PROVIDER');
console.log(
  `\nAI: ${provider === 'mock' ? 'demo mode (AI_PROVIDER=mock)' : key ? 'OpenAI' : 'not set up (add OPENAI_API_KEY to .env to turn on the AI features)'}`,
);

const children = [
  spawn('node', ['dist/main.js'], { cwd: join(root, 'apps', 'api'), stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'next', 'start', '--port', '3000'], { cwd: join(root, 'apps', 'web'), stdio: 'inherit', shell }),
];

console.log('\nReady soon: http://localhost:3000  (Ctrl+C to stop)\n');

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (shell && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
