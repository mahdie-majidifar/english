// Measures how the API behaves with a lot of data, on a database of its own (coach_perf), never the learner's.
//
//   pnpm perf                 about 6,000 items, 150,000 answers, a year of daily sessions
//   pnpm perf --small         the same walk on a small database, to compare against
//   PERF_ITEMS=20000 PERF_ATTEMPTS=600000 pnpm perf
//
// It builds the API first (`pnpm build`), starts it on port 4200 with the demo AI, fills the database
// with SQL (fast), then calls the screens' endpoints a few times each and prints how long they took.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const small = process.argv.includes('--small');
const ITEMS = Number(process.env.PERF_ITEMS ?? (small ? 120 : 6000));
const ATTEMPTS = Number(process.env.PERF_ATTEMPTS ?? (small ? 1500 : 150000));
const EXERCISES = Number(process.env.PERF_EXERCISES ?? ITEMS * 2);
const PORT = 4200;
const DB = small ? 'coach_perf_small' : 'coach_perf';
const API = `http://localhost:${PORT}/api/v1`;

// ── settings: the repo's .env, like the app ──
const dot = {};
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) dot[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const pick = (n) => process.env[n] ?? dot[n];
const devUrl = pick('DATABASE_URL');
if (!devUrl) throw new Error('DATABASE_URL is needed (set it in .env).');
const perfUrl = new URL(devUrl);
perfUrl.pathname = `/${DB}`;

const apiEnv = {
  ...process.env,
  DATABASE_URL: perfUrl.toString(),
  E2E_ADMIN_DATABASE_URL: devUrl,
  E2E_DB: DB,
  JWT_ACCESS_SECRET: pick('JWT_ACCESS_SECRET') ?? 'perf-secret-perf-secret-perf-secret-123456',
  API_PORT: String(PORT),
  WEB_ORIGIN: 'http://localhost:3300',
  AI_PROVIDER: 'mock',
  DISABLE_THROTTLE: '1',
  NODE_ENV: 'development',
  STORAGE_DIR: resolve(root, 'e2e', '.storage-perf'),
};

// ── start the API on a fresh database (start-api.mjs drops, creates and migrates it) ──
console.log(`Starting the API on a new database "${DB}" ...`);
const server = spawn(process.execPath, ['start-api.mjs'], { cwd: resolve(root, 'e2e'), env: apiEnv, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; ; i++) {
  if (i > 120) throw new Error('The API did not start.');
  if (await fetch(`${API}/health`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

// ── a signed-in learner ──
let cookie = '';
async function call(method, path, body) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = performance.now() - started;
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return { ok: res.ok, status: res.status, ms, bytes: text.length, json: text && text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : null };
}
const must = async (method, path, body) => {
  const r = await call(method, path, body);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.json)?.slice(0, 300)}`);
  return r.json;
};

const me = await must('POST', '/auth/register', { displayName: 'Perf Learner', email: 'perf@example.com', password: 'perf run 42 ok', timezone: 'Asia/Tehran' });
const userId = me.user.id;

// A book with lessons, from the built-in list, so there is a catalogue to hang the items on.
const templates = await must('GET', '/book-templates');
const template = (templates.templates ?? templates)[0];
const added = await must('POST', `/book-templates/${encodeURIComponent(template.key)}/add`);
const book = await must('GET', `/books/${added.id ?? added.book?.id}`);
const lessons = (book.units ?? book.book?.units ?? []).flatMap((u) => u.lessons);
if (!lessons.length) throw new Error('The book has no lessons.');
await must('PUT', '/me/current-lesson', { lessonId: lessons[0].id });

// ── fill the database ──
const db = new pg.Client({ connectionString: perfUrl.toString() });
await db.connect();
const q = (text, params) => db.query(text, params);
const step = async (label, text, params) => {
  const t = performance.now();
  await q(text, params);
  console.log(`  ${label.padEnd(34)} ${Math.round(performance.now() - t)} ms`);
};
console.log(`Filling: ${ITEMS} items, ${EXERCISES} exercises, ${ATTEMPTS} answers ...`);
const lessonIds = lessons.map((l) => l.id);

await step('learning items', `
  INSERT INTO "LearningItem"(id, "ownerId", type, headword, "normalizedKey", "meaningEn", "meaningFa", payload, "payloadVersion", source, "createdAt", "updatedAt")
  SELECT gen_random_uuid(), $1,
         (ARRAY['VOCABULARY','COLLOCATION','GRAMMAR','EXPRESSION','WORD_FORMATION','VOCABULARY'])[1 + n % 6]::"ItemType",
         'word' || n, 'word' || n, 'meaning of word ' || n, 'معنی کلمه ' || n,
         ('{"examples":["An example with word' || n || '."],"wordFamily":[]}')::jsonb, 1, 'BOOK',
         now() - (n || ' minutes')::interval, now()
  FROM generate_series(1, $2) n`, [userId, ITEMS]);
await q(`CREATE TEMP TABLE items_seed AS SELECT id, row_number() OVER (ORDER BY "createdAt") AS rn FROM "LearningItem" WHERE "ownerId" = $1`, [userId]);
await q('CREATE INDEX ON items_seed(rn)');
await step('lesson links', `
  INSERT INTO "LearningItemSource"(id, "itemId", "lessonId", "createdAt")
  SELECT gen_random_uuid(), i.id, (ARRAY[${lessonIds.map((_, k) => `$${k + 1}::uuid`).join(',')}])[1 + (i.rn % ${lessonIds.length})::int], now()
  FROM items_seed i`, lessonIds);
await step('learning state per item', `
  INSERT INTO "UserItemState"("userId", "itemId", status, "isWeak", due, stability, difficulty, "fsrsState", reps, lapses, "lastReviewedAt", "lastReviewLocalDate", mastery, "accuracyEwma", "currentLevel", "levelStreak", "firstSeenAt", "updatedAt")
  SELECT $1, i.id,
         (ARRAY['NEW','LEARNING','LEARNING','REVIEW','REVIEW','MASTERED'])[1 + i.rn % 6]::"LearningStatus",
         i.rn % 9 = 0,
         now() + (((i.rn % 40) - 12) || ' days')::interval,
         1 + (i.rn % 30), 5, 2, i.rn % 12, i.rn % 4,
         now() - ((i.rn % 60) || ' days')::interval, (current_date - ((i.rn % 60)::int)),
         (i.rn % 100) / 100.0, (i.rn % 100) / 100.0,
         (ARRAY['RECOGNITION','RECALL','CONTEXT','PRODUCTION'])[1 + i.rn % 4]::"ExerciseLevel", i.rn % 3,
         now() - ((i.rn % 90) || ' days')::interval, now()
  FROM items_seed i`, [userId]);

// Real exercises first (the app builds them), so the copies below have the right shapes.
const bases = new Set();
for (const scope of ['all', 'due', 'weak']) {
  for (let k = 0; k < 4; k++) {
    const run = await call('POST', '/practice', { scope, count: 20 });
    for (const e of run.json?.exercises ?? []) bases.add(e.id);
  }
}
const baseCount = Number((await q(`SELECT count(*) FROM "Exercise" WHERE "ownerId" = $1`, [userId])).rows[0].count);
console.log(`  (the app built ${baseCount} real exercises to copy)`);
await step('exercises (copies)', `
  INSERT INTO "Exercise"(id, "ownerId", format, level, skill, origin, status, content, solution, "evaluationMode", "estimatedSeconds", fingerprint, "createdAt")
  SELECT gen_random_uuid(), e."ownerId", e.format, e.level, e.skill, e.origin, e.status, e.content, e.solution, e."evaluationMode", e."estimatedSeconds", e.fingerprint || '#' || g, now() - (g || ' minutes')::interval
  FROM "Exercise" e CROSS JOIN generate_series(1, ceil($2::numeric / $3)::int) g
  WHERE e."ownerId" = $1 AND e.fingerprint NOT LIKE '%#%'`, [userId, EXERCISES, baseCount]);
await q(`CREATE TEMP TABLE ex_seed AS SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "Exercise" WHERE "ownerId" = $1`, [userId]);
await q('CREATE INDEX ON ex_seed(rn)');
const exCount = Number((await q(`SELECT count(*) FROM ex_seed`)).rows[0].count);
await step('exercise to item links', `
  INSERT INTO "ExerciseItem"("exerciseId", "itemId", "isPrimary")
  SELECT e.id, i.id, true FROM ex_seed e JOIN items_seed i ON i.rn = 1 + (e.rn % ${ITEMS})
  ON CONFLICT DO NOTHING`);

await step('answers', `
  INSERT INTO "ExerciseAttempt"(id, "userId", "exerciseId", context, response, score, "isCorrect", verdict, evaluation, "evaluatedBy", "durationMs", "hintsUsed", "createdAt")
  SELECT gen_random_uuid(), $1, e.id,
         (ARRAY['PRACTICE','PRACTICE','DAILY_SESSION','DAILY_SESSION','QUIZ','EXAM'])[1 + a % 6]::"AttemptContext",
         '{}'::jsonb, CASE WHEN a % 100 < 70 THEN 1 ELSE 0 END, a % 100 < 70,
         CASE WHEN a % 100 < 70 THEN 'correct' ELSE 'wrong' END, '{}'::jsonb, 'RULE', 2000 + (a % 9000), 0,
         now() - ((a % 365) || ' days')::interval - ((a % 1440) || ' minutes')::interval
  FROM generate_series(1, $2) a JOIN ex_seed e ON e.rn = 1 + ((a::bigint * 7919) % ${exCount})`, [userId, ATTEMPTS]);
await step('answer to item results', `
  INSERT INTO "AttemptItemResult"("attemptId", "itemId", "isCorrect", score, "errorCodes")
  SELECT a.id, ei."itemId", a."isCorrect", a.score, ARRAY[]::text[]
  FROM "ExerciseAttempt" a JOIN "ExerciseItem" ei ON ei."exerciseId" = a."exerciseId"
  WHERE a."userId" = $1
  ON CONFLICT DO NOTHING`, [userId]);
await step('review log', `
  INSERT INTO "ReviewLog"(id, "userId", "itemId", "attemptId", rating, "stabilityAfter", "dueAfter", "reviewedAt")
  SELECT gen_random_uuid(), $1, r."itemId", r."attemptId", 3, 6, a."createdAt" + interval '6 days', a."createdAt"
  FROM "AttemptItemResult" r JOIN "ExerciseAttempt" a ON a.id = r."attemptId" WHERE a."userId" = $1`, [userId]);
await step('xp events', `
  INSERT INTO "XpEvent"(id, "userId", amount, reason, "refId", "createdAt")
  SELECT gen_random_uuid(), $1, 1 + (row_number() OVER ()) % 2, 'ATTEMPT', a.id::text, a."createdAt" FROM "ExerciseAttempt" a WHERE a."userId" = $1
  ON CONFLICT DO NOTHING`, [userId]);
await q(
  `CREATE TEMP TABLE bad_attempts AS
   SELECT id, row_number() OVER () AS rn FROM (SELECT id FROM "ExerciseAttempt" WHERE "userId" = $1 AND "isCorrect" = false LIMIT 5000) x`,
  [userId],
);
const badCount = Number((await q('SELECT count(*) FROM bad_attempts')).rows[0].count) || 1;
await step('mistakes and their log', `
  WITH m AS (
    INSERT INTO "Mistake"(id, "userId", "itemId", "errorCode", signature, status, occurrences, priority, "correctDays", "firstSeenAt", "lastSeenAt")
    SELECT gen_random_uuid(), $1, i.id, 'GRAMMAR.TENSE_FORM', i.id::text || ':GRAMMAR.TENSE_FORM',
           (ARRAY['ACTIVE','ACTIVE','IMPROVING','RESOLVED'])[1 + i.rn % 4]::"MistakeStatus", 1 + i.rn % 6, (i.rn % 100) / 10.0, i.rn % 3,
           now() - ((i.rn % 120) || ' days')::interval, now() - ((i.rn % 30) || ' days')::interval
    FROM items_seed i WHERE i.rn % 2 = 0 RETURNING id),
  mr AS (SELECT id, row_number() OVER () AS rn FROM m)
  INSERT INTO "MistakeOccurrence"(id, "mistakeId", "attemptId", "userAnswer", "expectedAnswer", "createdAt")
  SELECT gen_random_uuid(), mr.id, ba.id, 'wrong', 'right', now() - (g || ' days')::interval
  FROM mr CROSS JOIN generate_series(1, 3) g JOIN bad_attempts ba ON ba.rn = 1 + ((mr.rn * 3 + g) % ${badCount})`, [userId]);
await step('a year of daily activity', `
  INSERT INTO "DailyActivity"("userId", "localDate", "activeSeconds", attempts, correct, "sessionsCompleted", xp, "goalMet")
  SELECT $1, current_date - d, 300 + (d * 37) % 1200, 20 + d % 60, 12 + d % 40, 1 + d % 2, 30 + d % 80, d % 5 <> 0
  FROM generate_series(1, 365) d ON CONFLICT DO NOTHING`, [userId]);
await step('a year of daily sessions', `
  WITH s AS (
    INSERT INTO "DailySession"(id, "userId", "localDate", ordinal, status, "plannedSeconds", "activeSeconds", "planMeta", score, "xpEarned", "startedAt", "completedAt", "createdAt")
    SELECT gen_random_uuid(), $1, current_date - d, 1, 'COMPLETED', 600, 540, '{}'::jsonb, 0.7, 40, now() - (d || ' days')::interval, now() - (d || ' days')::interval, now() - (d || ' days')::interval
    FROM generate_series(1, 365) d RETURNING id)
  INSERT INTO "DailySessionItem"(id, "sessionId", position, block, "exerciseId", "itemId", reason)
  SELECT gen_random_uuid(), s.id, p, (ARRAY['WARM_UP','NEW_CONTENT','PRACTICE','CONTEXT','PRODUCTION','REVIEW'])[1 + p % 6]::"SessionBlock",
         (SELECT id FROM ex_seed WHERE rn = 1 + ((p * 31 + length(s.id::text)) % ${exCount})),
         (SELECT id FROM items_seed WHERE rn = 1 + ((p * 17) % ${ITEMS})), 'DUE_REVIEW'::"SelectionReason"
  FROM s CROSS JOIN generate_series(1, 12) p`, [userId]);
await step('200 graded quizzes and exams', `
  WITH a AS (
    INSERT INTO "Assessment"(id, "userId", kind, preset, title, status, "timeLimitSec", "startedAt", "gradedAt", score, "xpEarned", "newAchievements", breakdown, "createdAt")
    SELECT gen_random_uuid(), $1, (ARRAY['QUIZ','EXAM'])[1 + n % 2]::"AssessmentKind", (ARRAY['LESSON','WEEKLY'])[1 + n % 2]::"AssessmentPreset", 'Seeded ' || n, 'GRADED', 600,
           now() - (n || ' days')::interval, now() - (n || ' days')::interval, (n % 100) / 100.0, 20, ARRAY[]::text[], '{}'::jsonb, now() - (n || ' days')::interval
    FROM generate_series(1, 200) n RETURNING id)
  INSERT INTO "AssessmentQuestion"(id, "assessmentId", position, "exerciseId", skill, points, "answeredAt")
  SELECT gen_random_uuid(), a.id, p, (SELECT id FROM ex_seed WHERE rn = 1 + ((p * 13 + length(a.id::text)) % ${exCount})), 'VOCABULARY', 1, now()
  FROM a CROSS JOIN generate_series(1, 20) p`, [userId]);
await step('xp and streak', `
  INSERT INTO "UserGamification"("userId", "totalXp", "currentStreak", "longestStreak", "lastStreakDate")
  SELECT $1, COALESCE(sum(amount), 0), 120, 200, current_date - 1 FROM "XpEvent" WHERE "userId" = $1
  ON CONFLICT ("userId") DO UPDATE SET "totalXp" = EXCLUDED."totalXp", "currentStreak" = 120, "longestStreak" = 200, "lastStreakDate" = EXCLUDED."lastStreakDate"`, [userId]);
await q('ANALYZE');

const counts = {};
for (const t of ['LearningItem', 'Exercise', 'ExerciseAttempt', 'AttemptItemResult', 'ReviewLog', 'XpEvent', 'Mistake', 'MistakeOccurrence', 'DailySessionItem', 'AssessmentQuestion']) {
  counts[t] = Number((await q(`SELECT count(*) FROM "${t}"`)).rows[0].count);
}
console.log('Rows:', Object.entries(counts).map(([k, v]) => `${k} ${v.toLocaleString('en')}`).join(', '));

// ── measure ──
const firstLesson = lessons[0];
const firstBook = added.id ?? added.book?.id;
const reads = [
  ['GET', '/dashboard'],
  ['GET', '/progress?days=7'],
  ['GET', '/progress?days=30'],
  ['GET', '/progress?days=90'],
  ['GET', '/challenges'],
  ['GET', '/achievements'],
  ['GET', '/mistakes'],
  ['GET', '/mistakes/summary'],
  ['GET', '/items?limit=30'],
  ['GET', '/items?limit=30&type=VOCABULARY'],
  ['GET', `/items?limit=30&lessonId=${firstLesson.id}`],
  ['GET', '/items?limit=30&q=word12'],
  ['GET', '/search?q=word99'],
  ['GET', '/books'],
  ['GET', `/books/${firstBook}`],
  ['GET', '/me/current'],
  ['GET', `/learn/context?lessonId=${firstLesson.id}`],
  ['GET', '/assessments'],
  ['GET', '/daily-sessions/today'],
];
const writes = [
  ['POST', '/daily-sessions', { extra: true }],
  ['POST', '/practice', { scope: 'all', count: 10 }],
  ['POST', '/practice', { scope: 'due', count: 10 }],
  ['POST', '/practice', { scope: 'mistakes', count: 10 }],
  ['POST', '/practice', { scope: 'weak', count: 10 }],
  ['POST', '/assessments', { kind: 'QUIZ', preset: 'WEAK_AREAS' }],
  ['POST', '/assessments', { kind: 'EXAM', preset: 'MONTHLY' }],
];

const REPEAT = 5;
const rows = [];
for (const [method, path, body] of [...reads, ...writes]) {
  const times = [];
  let last;
  let cold = 0;
  const n = method === 'GET' ? REPEAT : 3;
  for (let i = 0; i < n + 1; i++) {
    last = await call(method, path, body);
    if (i === 0) cold = last.ms; // the first call also warms things up: shown apart
    else times.push(last.ms);
  }
  times.sort((a, b) => a - b);
  rows.push({ call: `${method} ${path}`.replace(firstLesson.id, ':lesson').replace(firstBook, ':book'), status: last.status, cold, median: times[Math.floor(times.length / 2)], max: times[times.length - 1], kb: last.bytes / 1024 });
}

// One answer (the hottest write of all): the first exercise of a fresh practice run.
const run = await must('POST', '/practice', { scope: 'all', count: 5 });
const mc = run.exercises.find((e) => e.format === 'multiple_choice');
const answerTimes = [];
let answerCold = 0;
if (mc) {
  for (let i = 0; i < 5; i++) {
    const r = await call('POST', '/attempts', { clientAttemptId: crypto.randomUUID(), exerciseId: mc.id, response: { optionId: mc.content.options[0].id }, durationMs: 3000 });
    if (!r.ok) { console.log('answer failed', r.status, JSON.stringify(r.json)?.slice(0, 200)); break; }
    if (i === 0) answerCold = r.ms;
    answerTimes.push(r.ms);
  }
  answerTimes.sort((a, b) => a - b);
  rows.push({ call: 'POST /attempts (one answer)', status: 200, cold: answerCold, median: answerTimes[Math.floor(answerTimes.length / 2)], max: answerTimes[answerTimes.length - 1], kb: 0 });
}

console.log(`\nDatabase "${DB}" (${small ? 'small' : 'large'}). Times in ms (median of ${REPEAT} reads, 3 writes; max in brackets). Slow = over 300.\n`);
for (const r of rows) {
  const worst = Math.max(r.cold, r.median);
  const flag = worst > 300 ? '  <-- SLOW' : worst > 150 ? '  (watch)' : '';
  console.log(`${r.call.padEnd(52)} ${String(r.status).padEnd(4)} ${r.cold.toFixed(0).padStart(5)} ${r.median.toFixed(0).padStart(6)} (${r.max.toFixed(0)})  ${r.kb.toFixed(1).padStart(7)} kB${flag}`);
}

await db.end();
stop();
process.exit(0);
