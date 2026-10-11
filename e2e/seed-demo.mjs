// Fills the test stack (pnpm --filter @coach/e2e stack) with a learner who has been around for a bit, so every
// screen has something to show. Signs in as demo@example.com in the browser with the same password.
//   node seed-demo.mjs
const API = process.env.API ?? 'http://localhost:4100/api/v1';
const EMAIL = 'demo@example.com';
const PASSWORD = 'demo learner 42 ok';

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

await call('POST', '/auth/register', { displayName: 'Mina', email: EMAIL, password: PASSWORD, timezone: 'Asia/Tehran' }).catch(async () => {
  await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
});

const templates = await call('GET', '/book-templates');
const added = await call('POST', `/book-templates/${encodeURIComponent((templates.templates ?? templates)[0].key)}/add`);
const bookId = added.id ?? added.book?.id;
await call('POST', `/books/${bookId}/import-structure`, { text: 'Unit 1 People\n1A Meeting people\n1B Jobs\n1C Free time' });
const book = await call('GET', `/books/${bookId}`);
const lessons = book.units.flatMap((u) => u.lessons);
const lesson = lessons.find((l) => l.code === '1A') ?? lessons[0];
await call('PUT', '/me/current-lesson', { lessonId: lesson.id });

const words = [
  ['VOCABULARY', 'negotiate', 'مذاکره کردن', ['We negotiated a big discount yesterday.']],
  ['VOCABULARY', 'colleague', 'همکار', ['My colleague helped me with the report.']],
  ['VOCABULARY', 'agenda', 'دستور جلسه', ['The first item on the agenda is the budget.']],
  ['VOCABULARY', 'invoice', 'فاکتور', ['Please send me the invoice by Friday.']],
  ['VOCABULARY', 'deadline', 'مهلت', ['We must meet the deadline next week.']],
  ['COLLOCATION', 'make a decision', 'تصمیم گرفتن', ['It is hard to make a decision quickly.']],
  ['COLLOCATION', 'take a break', 'استراحت کردن', ['Let us take a break for ten minutes.']],
  ['EXPRESSION', 'on the same page', 'هم‌نظر بودن', ['I think we are on the same page now.']],
];
for (const [type, headword, meaningFa, examples] of words) {
  await call('POST', '/items', { type, headword, meaningFa, payload: { examples }, lessonIds: [lesson.id] });
}
await call('POST', '/items', { type: 'IRREGULAR_VERB', headword: 'wear', meaningFa: 'پوشیدن', payload: { base: 'wear', past: 'wore', pastParticiple: 'worn' }, lessonIds: [lesson.id] });
await call('POST', '/items', { type: 'WORD_FORMATION', headword: 'fail', meaningFa: 'شکست خوردن', payload: { base: 'fail', forms: [{ form: 'failure', pos: 'noun' }, { form: 'failed', pos: 'adjective' }] }, lessonIds: [lesson.id] });

// Answer a few runs, some right and some wrong, so progress, mistakes and streaks have data.
let answered = 0;
for (let run = 0; run < 3; run++) {
  const { exercises } = await call('POST', '/practice', { scope: 'all', count: 12 });
  for (const [i, e] of exercises.entries()) {
    const wrong = (i + run) % 3 === 0;
    const response =
      e.format === 'multiple_choice' ? { optionId: e.content.options[wrong ? 1 : 0].id }
      : e.format === 'flashcard' ? { rating: wrong ? 1 : 3 }
      : e.format === 'matching' ? { pairs: {} }
      : e.format === 'irregular_verb_forms' ? { past: 'x', pastParticiple: 'y' }
      : e.format === 'sentence_order' ? { order: e.content.tokens.map((_, k) => k) }
      : { answer: 'answer' };
    await call('POST', '/attempts', { clientAttemptId: crypto.randomUUID(), exerciseId: e.id, response }).then(() => answered++, () => undefined);
  }
}

console.log(`Demo learner ready: ${EMAIL} / ${PASSWORD} (${answered} answers). Sign in at the site, or POST /auth/login in the page.`);
