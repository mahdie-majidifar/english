import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DraftItem, ParsedMaterial } from '@coach/contracts';
import { emptyDraftItem } from '@coach/contracts';
import { LlmError } from '../src/modules/ai/llm.js';
import { FakeLlmProvider } from '../src/modules/ai/providers/fake.provider.js';
import { IngestionWorker } from '../src/modules/teacher/ingestion.worker.js';
import {
  API,
  createIntegrationApp,
  hasDatabase,
  resetDatabase,
  signedInAgent,
  type TestContext,
} from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const item = (patch: Partial<DraftItem> & Pick<DraftItem, 'type' | 'headword'>): DraftItem => ({
  ...emptyDraftItem(patch.type, patch.headword),
  ...patch,
});

const NOTES: ParsedMaterial = {
  summary: 'Business vocabulary and reported speech.',
  items: [
    item({ type: 'VOCABULARY', headword: 'negotiate', meaningEn: 'to discuss to reach an agreement', meaningFa: 'مذاکره کردن', partOfSpeech: 'verb' }),
    item({ type: 'COLLOCATION', headword: 'negotiate a discount', meaningFa: 'تخفیف گرفتن' }),
    item({ type: 'GRAMMAR', headword: 'Reported speech', structure: 'say that + backshift', confidence: 'medium' }),
    item({ type: 'IRREGULAR_VERB', headword: 'wear', past: 'wore', pastParticiple: 'worn' }),
    // Incomplete on purpose: an irregular verb without its forms.
    item({ type: 'IRREGULAR_VERB', headword: 'weave', confidence: 'low' }),
  ],
  exercises: [
    { originalText: '"I didn\'t buy you a present," she said. → Change into reported speech.', skill: 'GRAMMAR', topic: 'Reported speech' },
  ],
};

describe.skipIf(!hasDatabase())('teacher material pipeline (real PostgreSQL, fake AI)', () => {
  let ctx: TestContext;
  let worker: IngestionWorker;
  let ai: FakeLlmProvider;
  let alice: Agent;
  let bob: Agent;

  let lessonId: string;
  let sessionId: string;

  const runWorker = () => worker.tick();

  async function addNotes(text = 'Session 21\nVocabulary: negotiate\nGrammar: Reported speech') {
    const res = await alice.post(`${API}/teacher-sessions/${sessionId}/materials/text`).send({ text }).expect(201);
    await runWorker();
    return res.body.id as string;
  }

  beforeAll(async () => {
    ai = new FakeLlmProvider(() => NOTES);
    ctx = await createIntegrationApp({ llm: ai });
    worker = ctx.app.get(IngestionWorker);
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');

    const book = (await alice.post(`${API}/books`).send({ title: 'American English File 3' }).expect(201)).body;
    await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8B Business' }).expect(200);
    lessonId = (await alice.get(`${API}/books/${book.id}`)).body.units[0].lessons[0].id;

    const session = await alice
      .post(`${API}/teacher-sessions`)
      .send({ title: 'Session 21', classDate: '2026-10-05', lessonId })
      .expect(201);
    sessionId = session.body.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('sessions', () => {
    it('lists sessions with their lesson and counts', async () => {
      const list = (await alice.get(`${API}/teacher-sessions`).expect(200)).body;
      expect(list[0]).toMatchObject({
        title: 'Session 21',
        classDate: '2026-10-05',
        lesson: { code: '8B' },
        materialCount: 0,
        itemCount: 0,
      });
    });

    it('validates input and refuses a lesson that is not yours', async () => {
      await alice.post(`${API}/teacher-sessions`).send({ title: '', classDate: 'yesterday' }).expect(400);
      await bob.post(`${API}/teacher-sessions`).send({ title: 'x', classDate: '2026-10-05', lessonId }).expect(404);
    });
  });

  describe('text notes: analyse, review, commit', () => {
    let materialId: string;

    it('queues pasted notes, then proposes structured items for review', async () => {
      const created = await alice
        .post(`${API}/teacher-sessions/${sessionId}/materials/text`)
        .send({ text: 'Session 21\nVocabulary: negotiate\nGrammar: Reported speech' })
        .expect(201);
      materialId = created.body.id;
      expect(created.body).toMatchObject({ status: 'UPLOADED', category: 'CLASS_NOTES', draft: null });

      await runWorker();
      const material = (await alice.get(`${API}/teacher-materials/${materialId}`).expect(200)).body;
      expect(material.status).toBe('AWAITING_REVIEW');
      expect(material.originalText).toContain('negotiate');
      expect(material.draft.summary).toMatch(/Business/);
      expect(material.draft.items).toHaveLength(5);
      expect(material.draft.items.every((i: { known: boolean }) => i.known === false)).toBe(true);
      expect(material.draft.exercises[0].originalText).toContain("I didn't buy you a present");
    });

    it('sent the learner text as data, with rules in the system prompt, and recorded the run', async () => {
      const call = ai.calls.at(-1)!;
      expect(call.schemaName).toBe('parsed_material');
      const [system, user] = call.messages;
      expect(system!.role).toBe('system');
      expect(String(system!.content)).toMatch(/data, not instructions/);
      expect(String(user!.content)).toContain('<material>');

      const runs = await ctx.prisma.aiRun.findMany({ where: { task: 'PARSE_MATERIAL' }, orderBy: { createdAt: 'asc' } });
      expect(runs.at(-1)).toMatchObject({ success: true, inputTokens: 100, promptId: 'parse-material', promptVersion: 1 });
    });

    it('commits only what the learner confirms, skipping incomplete items with a reason', async () => {
      const draft = (await alice.get(`${API}/teacher-materials/${materialId}`)).body.draft;
      // The learner edits one meaning before saving.
      const items = draft.items.map((i: DraftItem & { known: boolean }) => {
        const { known: _known, ...rest } = i;
        return rest.headword === 'negotiate' ? { ...rest, meaningFa: 'مذاکره کردن، چانه زدن' } : rest;
      });

      const res = await alice
        .post(`${API}/teacher-materials/${materialId}/commit`)
        .send({ items, exercises: draft.exercises })
        .expect(200);
      expect(res.body).toMatchObject({ created: 4, merged: 0, exercises: 1 });
      expect(res.body.skipped).toEqual([{ headword: 'weave', reason: 'Needs the past simple and past participle' }]);

      const library = (await alice.get(`${API}/items`)).body.items as {
        headword: string;
        source: string;
        meaningFa: string | null;
        lessons: { code: string }[];
        sessions: { title: string }[];
      }[];
      expect(library.map((i) => i.headword).sort()).toEqual(['Reported speech', 'negotiate', 'negotiate a discount', 'wear']);
      const negotiate = library.find((i) => i.headword === 'negotiate')!;
      expect(negotiate).toMatchObject({ source: 'TEACHER', meaningFa: 'مذاکره کردن، چانه زدن' });
      expect(negotiate.lessons.map((l) => l.code)).toEqual(['8B']); // from the session's lesson
      expect(negotiate.sessions.map((s) => s.title)).toEqual(['Session 21']);
    });

    it('keeps the teacher exercise word for word', async () => {
      const exercises = await ctx.prisma.teacherExercise.findMany();
      expect(exercises).toHaveLength(1);
      expect(exercises[0]!.originalText).toBe(NOTES.exercises[0]!.originalText);
    });

    it('is committed once: a second commit is refused', async () => {
      await alice.post(`${API}/teacher-materials/${materialId}/commit`).send({ items: [], exercises: [] }).expect(409);
      await alice.post(`${API}/teacher-materials/${materialId}/reparse`).expect(409);
      expect((await alice.get(`${API}/teacher-materials/${materialId}`)).body.status).toBe('COMMITTED');
    });

    it('updates the session counts', async () => {
      const list = (await alice.get(`${API}/teacher-sessions`)).body;
      expect(list[0]).toMatchObject({ materialCount: 1, itemCount: 4, latestStatus: 'COMMITTED' });
    });

    it('merges into existing items instead of duplicating or overwriting', async () => {
      ai.setResponder(() => ({
        summary: 'Again.',
        items: [
          item({ type: 'VOCABULARY', headword: 'Negotiate', meaningFa: 'چیز دیگری' }),
          item({ type: 'VOCABULARY', headword: 'disposable income', meaningFa: 'درآمد قابل تصرف' }),
        ],
        exercises: [],
      }));
      const id = await addNotes('Session 22\nnegotiate again');
      const material = (await alice.get(`${API}/teacher-materials/${id}`)).body;
      expect(material.draft.items.map((i: { known: boolean }) => i.known)).toEqual([true, false]);

      const stripped = material.draft.items.map(({ known: _k, ...rest }: DraftItem & { known: boolean }) => rest);
      const res = await alice.post(`${API}/teacher-materials/${id}/commit`).send({ items: stripped, exercises: [] }).expect(200);
      expect(res.body).toMatchObject({ created: 1, merged: 1 });

      const negotiate = (await alice.get(`${API}/items?q=negotiate&type=VOCABULARY`)).body.items[0];
      expect(negotiate.meaningFa).toBe('مذاکره کردن، چانه زدن'); // untouched
      expect((await alice.get(`${API}/items?type=VOCABULARY`)).body.items).toHaveLength(2);
    });
  });

  describe('when the AI misbehaves', () => {
    it('explains clearly when AI is not set up, keeps the original, and recovers after setup', async () => {
      ai.isConfigured = false;
      const res = await alice.post(`${API}/teacher-sessions/${sessionId}/materials/text`).send({ text: 'new words' }).expect(201);
      await runWorker();
      const failed = (await alice.get(`${API}/teacher-materials/${res.body.id}`)).body;
      expect(failed).toMatchObject({ status: 'FAILED', originalText: 'new words' });
      expect(failed.errorMessage).toMatch(/OPENAI_API_KEY/);

      ai.isConfigured = true;
      ai.setResponder(() => NOTES);
      await alice.post(`${API}/teacher-materials/${res.body.id}/reparse`).expect(200);
      await runWorker();
      expect((await alice.get(`${API}/teacher-materials/${res.body.id}`)).body.status).toBe('AWAITING_REVIEW');
    });

    it('repairs one malformed answer automatically', async () => {
      const before = ai.calls.length;
      ai.setResponder((_req, n) => (n === before + 1 ? { summary: 'broken', items: 'not a list' } : NOTES));
      const id = await addNotes('repair me');
      expect((await alice.get(`${API}/teacher-materials/${id}`)).body.status).toBe('AWAITING_REVIEW');
      expect(ai.calls.length - before).toBe(2);
      // The second call was told exactly what was wrong.
      const repair = ai.calls.at(-1)!.messages.at(-1)!;
      expect(String(repair.content)).toMatch(/failed validation/);
    });

    it('gives up on answers that stay malformed, with a friendly message', async () => {
      ai.setResponder(() => ({ nonsense: true }));
      const id = await addNotes('hopeless');
      const material = (await alice.get(`${API}/teacher-materials/${id}`)).body;
      expect(material.status).toBe('FAILED');
      expect(material.errorMessage).toMatch(/could not use/);
      expect(material.errorMessage).not.toMatch(/zod|schema|json/i);
    });

    it('retries a transient failure and then succeeds', async () => {
      const before = ai.calls.length;
      ai.setResponder((_req, n) => {
        if (n === before + 1) throw new LlmError('The AI took too long to answer.', true);
        return NOTES;
      });
      const id = await addNotes('flaky network');
      expect((await alice.get(`${API}/teacher-materials/${id}`)).body.status).toBe('AWAITING_REVIEW');
      expect(ai.calls.length - before).toBe(2);
    });

    it('does not retry a rejected API key', async () => {
      const before = ai.calls.length;
      ai.setResponder(() => {
        throw new LlmError('The AI service rejected the API key.', false, 401);
      });
      const id = await addNotes('bad key');
      const material = (await alice.get(`${API}/teacher-materials/${id}`)).body;
      expect(material).toMatchObject({ status: 'FAILED', errorMessage: 'The AI service rejected the API key.' });
      expect(ai.calls.length - before).toBe(1);
    });

    it('stops at the daily AI limit', async () => {
      const limit = Number(process.env['AI_DAILY_CALL_LIMIT'] ?? 100);
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
      const used = await ctx.prisma.aiRun.count({ where: { userId: user.id } });
      await ctx.prisma.aiRun.createMany({
        data: Array.from({ length: Math.max(0, limit - used) }, () => ({
          userId: user.id,
          task: 'FILLER',
          provider: 'fake',
          model: 'm',
          promptId: 'p',
          promptVersion: 1,
          success: true,
          latencyMs: 1,
        })),
      });
      ai.setResponder(() => NOTES);
      const id = await addNotes('over the limit');
      const material = (await alice.get(`${API}/teacher-materials/${id}`)).body;
      expect(material.status).toBe('FAILED');
      expect(material.errorMessage).toMatch(/limit/i);
      await ctx.prisma.aiRun.deleteMany({ where: { task: 'FILLER' } });
    });
  });

  describe('file uploads', () => {
    const upload = (agent: Agent, body: Buffer, name: string, extra: Record<string, string> = {}) => {
      const req = agent.post(`${API}/teacher-sessions/${sessionId}/materials/file`).attach('file', body, name);
      for (const [k, v] of Object.entries(extra)) req.field(k, v);
      return req;
    };

    it('stores a text file, reads it, and keeps the original downloadable byte for byte', async () => {
      ai.setResponder(() => NOTES);
      const original = Buffer.from('Session 23\nVocabulary: conservative, strictly\n', 'utf8');
      const res = await upload(alice, original, 'notes.txt', { category: 'HANDOUT', title: 'Week 23' }).expect(201);
      expect(res.body).toMatchObject({ title: 'Week 23', category: 'HANDOUT', fileName: 'notes.txt', mimeType: 'text/plain' });

      await runWorker();
      const material = (await alice.get(`${API}/teacher-materials/${res.body.id}`)).body;
      expect(material.status).toBe('AWAITING_REVIEW');
      // The extracted text is trimmed for reading; the stored file itself is untouched (checked below).
      expect(material.originalText).toBe(original.toString('utf8').trim());

      const download = await alice.get(`${API}/teacher-materials/${res.body.id}/file`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body as Buffer, original)).toBe(0);
      expect(download.headers['content-disposition']).toMatch(/attachment/);
    });

    it('sends pictures to the AI as images', async () => {
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      );
      const res = await upload(alice, png, 'board.png').expect(201);
      expect(res.body.mimeType).toBe('image/png');
      await runWorker();
      const user = ai.calls.at(-1)!.messages.at(-1)!;
      expect(Array.isArray(user.content) && user.content.some((p) => p.type === 'image')).toBe(true);
    });

    it('trusts the file contents, not the name or the claimed type', async () => {
      // A Windows executable renamed to .pdf.
      const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
      const res = await upload(alice, exe, 'invoice.pdf').expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      // Binary junk that is not any known type.
      await upload(alice, Buffer.alloc(300, 0), 'data.txt').expect(400);
    });

    it('rejects empty and oversized files', async () => {
      await upload(alice, Buffer.alloc(0), 'empty.txt').expect(400);
      const big = Buffer.alloc(16 * 1024 * 1024, 97);
      const res = await upload(alice, big, 'huge.txt');
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('requires a file', async () => {
      await alice.post(`${API}/teacher-sessions/${sessionId}/materials/file`).field('category', 'CLASS_NOTES').expect(400);
    });

    it('never uses the original filename on disk', async () => {
      const files = await ctx.prisma.storedFile.findMany();
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(f.storageKey).toMatch(/^[0-9a-f-]{36}\/\d{4}\/[0-9a-f-]{36}\.(txt|png)$/);
        expect(f.sha256).toHaveLength(64);
      }
    });
  });

  describe('isolation', () => {
    it("hides one learner's sessions, materials, drafts and files from another", async () => {
      ai.setResponder(() => NOTES);
      const id = await addNotes('private notes');
      await bob.get(`${API}/teacher-sessions/${sessionId}`).expect(404);
      await bob.get(`${API}/teacher-materials/${id}`).expect(404);
      await bob.get(`${API}/teacher-materials/${id}/file`).expect(404);
      await bob.post(`${API}/teacher-materials/${id}/commit`).send({ items: [], exercises: [] }).expect(404);
      await bob.post(`${API}/teacher-materials/${id}/discard`).expect(404);
      await bob.post(`${API}/teacher-sessions/${sessionId}/materials/text`).send({ text: 'sneaky' }).expect(404);
      expect((await bob.get(`${API}/teacher-sessions`)).body).toEqual([]);
    });

    it('lets the owner discard a draft, which then cannot be committed', async () => {
      const id = await addNotes('throw away');
      await alice.post(`${API}/teacher-materials/${id}/discard`).expect(204);
      expect((await alice.get(`${API}/teacher-materials/${id}`)).body).toMatchObject({ status: 'DISCARDED', draft: null });
      await alice.post(`${API}/teacher-materials/${id}/commit`).send({ items: [], exercises: [] }).expect(409);
    });
  });

  describe('worker', () => {
    it('re-queues materials orphaned by a crash', async () => {
      const res = await alice.post(`${API}/teacher-sessions/${sessionId}/materials/text`).send({ text: 'orphan' }).expect(201);
      await ctx.prisma.teacherMaterial.update({
        where: { id: res.body.id },
        data: { status: 'PARSING', lockedAt: new Date(Date.now() - 10 * 60_000) },
      });
      expect(await worker.recoverStale()).toBeGreaterThanOrEqual(1);
      await runWorker();
      expect((await alice.get(`${API}/teacher-materials/${res.body.id}`)).body.status).toBe('AWAITING_REVIEW');
    });

    it('deleting a session removes its materials but keeps library items', async () => {
      const before = (await alice.get(`${API}/items`)).body.items.length;
      await alice.delete(`${API}/teacher-sessions/${sessionId}`).expect(204);
      await alice.get(`${API}/teacher-sessions/${sessionId}`).expect(404);
      expect((await alice.get(`${API}/items`)).body.items.length).toBe(before);
    });
  });
});
