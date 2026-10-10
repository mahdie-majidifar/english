import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyDraftItem, type DraftItem, type Explanation, type ParsedMaterial } from '@coach/contracts';
import { LlmError } from '../src/modules/ai/llm.js';
import { FakeLlmProvider } from '../src/modules/ai/providers/fake.provider.js';
import { API, createIntegrationApp, hasDatabase, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const word = (headword: string, meaningFa: string): DraftItem => ({
  ...emptyDraftItem('VOCABULARY', headword),
  meaningEn: `meaning of ${headword}`,
  meaningFa,
  partOfSpeech: 'noun',
  examples: [`I like the ${headword}.`],
  // Whatever the AI claims, suggestions are never "from the teacher".
  confidence: 'high',
});

const SUGGESTIONS: ParsedMaterial = {
  summary: 'Business words.',
  items: [word('agenda', 'دستور جلسه'), word('deadline', 'مهلت'), word('invoice', 'فاکتور')],
  exercises: [{ originalText: 'should be dropped', skill: 'GRAMMAR', topic: null }],
};

const EXPLANATION: Explanation = {
  overviewFa: 'این واژه یعنی مهلت.',
  keyPoints: ['بعد از meet می‌آید.'],
  examples: [{ en: 'We met the deadline.', fa: 'ما به مهلت رسیدیم.' }],
  commonMistakes: [{ wrong: 'I reached the deadline.', right: 'I met the deadline.', noteFa: 'با meet به کار می‌رود.' }],
};

describe.skipIf(!hasDatabase())('teaching: explanations and AI lesson suggestions (real PostgreSQL, fake AI)', () => {
  let ctx: TestContext;
  let ai: FakeLlmProvider;
  let alice: Agent;
  let bob: Agent;
  let namedLesson: string;
  let neutralLesson: string;
  let deadlineId: string;

  beforeAll(async () => {
    ai = new FakeLlmProvider((req) => (req.schemaName === 'item_explanation' ? EXPLANATION : SUGGESTIONS));
    ctx = await createIntegrationApp({ llm: ai });
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');

    const book = (await alice.post(`${API}/book-templates/aef-3e-3/add`).expect(201)).body;
    const detail = (await alice.get(`${API}/books/${book.id}`)).body;
    neutralLesson = detail.units[7].lessons[1].id; // "Lesson B", not named yet
    await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8A Shopping' }).expect(200);
    namedLesson = detail.units[7].lessons[0].id;

    deadlineId = (
      await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'deadline', meaningFa: 'مهلت', lessonIds: [namedLesson] }).expect(201)
    ).body.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('what the Learn screen is about', () => {
    it('names a lesson and counts what is in it', async () => {
      const res = await alice.get(`${API}/learn/context?lessonId=${namedLesson}`).expect(200);
      expect(res.body).toMatchObject({ kind: 'lesson', title: '8A · Shopping', subtitle: 'American English File 3 (Third Edition)', itemCount: 1, needsTopic: false });
    });

    it('says when a lesson has only a neutral name, so the AI will need a topic', async () => {
      const res = await alice.get(`${API}/learn/context?lessonId=${neutralLesson}`).expect(200);
      expect(res.body).toMatchObject({ title: '8B · Lesson B', itemCount: 0, needsTopic: true });
    });

    it('describes a whole unit', async () => {
      const unitId = (await alice.get(`${API}/learn/context?lessonId=${namedLesson}`)).body.unitId;
      const res = await alice.get(`${API}/learn/context?unitId=${unitId}`).expect(200);
      expect(res.body).toMatchObject({ kind: 'unit', title: 'Unit 8', lessonId: null, needsTopic: false });
      expect(res.body.itemCount).toBeGreaterThanOrEqual(1);
    });

    it('needs exactly one of lesson or unit, and never shows another learner’s', async () => {
      await alice.get(`${API}/learn/context`).expect(400);
      await alice.get(`${API}/learn/context?lessonId=${namedLesson}&unitId=${namedLesson}`).expect(400);
      await bob.get(`${API}/learn/context?lessonId=${namedLesson}`).expect(404);
    });
  });

  describe('explaining an item', () => {
    it('has nothing until the learner asks', async () => {
      expect((await alice.get(`${API}/items/${deadlineId}/explanation`).expect(200)).body).toEqual({ explanation: null });
    });

    it('writes a mini-lesson with the AI and keeps it', async () => {
      const before = ai.calls.length;
      const res = await alice.post(`${API}/items/${deadlineId}/explain`).expect(200);
      expect(res.body.explanation).toEqual(EXPLANATION);
      expect(ai.calls.length).toBe(before + 1);

      const call = ai.calls.at(-1)!;
      expect(call.schemaName).toBe('item_explanation');
      expect(String(call.messages[0]!.content)).toMatch(/data, not instructions/);
      expect(String(call.messages[1]!.content)).toContain('headword: deadline');

      expect((await alice.get(`${API}/items/${deadlineId}/explanation`)).body.explanation).toEqual(EXPLANATION);
      const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
      expect(await ctx.prisma.aiRun.count({ where: { userId: owner.id, task: 'EXPLAIN_ITEM', success: true } })).toBe(1);
    });

    it('does not pay for it twice, unless asked to refresh', async () => {
      const before = ai.calls.length;
      await alice.post(`${API}/items/${deadlineId}/explain`).expect(200);
      expect(ai.calls.length).toBe(before);

      await alice.post(`${API}/items/${deadlineId}/explain?refresh=1`).expect(200);
      expect(ai.calls.length).toBe(before + 1);
      expect(await ctx.prisma.itemExplanation.count()).toBe(1);
    });

    it('keeps one learner out of another’s items', async () => {
      await bob.get(`${API}/items/${deadlineId}/explanation`).expect(404);
      await bob.post(`${API}/items/${deadlineId}/explain`).expect(404);
    });

    it('does not keep anything when the AI fails, and says so', async () => {
      const other = (await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'budget', meaningFa: 'بودجه' }).expect(201)).body.id;
      ai.setResponder(() => {
        throw new LlmError('The AI is busy.', false, 400);
      });
      const res = await alice.post(`${API}/items/${other}/explain`).expect(503);
      expect(res.body.code).toBe('AI_UNAVAILABLE');
      expect((await alice.get(`${API}/items/${other}/explanation`)).body.explanation).toBeNull();
      ai.setResponder((req) => (req.schemaName === 'item_explanation' ? EXPLANATION : SUGGESTIONS));
    });

    it('is removed together with the item', async () => {
      const temp = (await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'tempword', meaningFa: 'موقت' }).expect(201)).body.id;
      await alice.post(`${API}/items/${temp}/explain`).expect(200);
      await ctx.prisma.learningItem.delete({ where: { id: temp } });
      expect(await ctx.prisma.itemExplanation.count({ where: { itemId: temp } })).toBe(0);
    });
  });

  describe('filling a lesson with AI suggestions', () => {
    it('parks the suggestions for review instead of saving them', async () => {
      const before = await ctx.prisma.learningItem.count({ where: { ownerId: (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id } });
      const res = await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({}).expect(200);
      expect(res.body.itemCount).toBe(2); // "deadline" is already in the lesson, so it is not suggested again

      const material = (await alice.get(`${API}/teacher-materials/${res.body.materialId}`).expect(200)).body;
      expect(material.status).toBe('AWAITING_REVIEW');
      expect(material.title).toContain('AI suggestions');
      expect(material.originalText).toMatch(/not your teacher/i);
      expect(material.draft.items.map((i: DraftItem) => i.headword).sort()).toEqual(['agenda', 'invoice']);
      expect(material.draft.exercises).toEqual([]);
      expect(material.draft.items.every((i: DraftItem) => i.confidence === 'medium')).toBe(true);

      const after = await ctx.prisma.learningItem.count({ where: { ownerId: (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id } });
      expect(after).toBe(before);
    });

    it('tells the AI the book, level, topic and what the lesson already has', async () => {
      const text = String(ai.calls.at(-1)!.messages.at(-1)!.content);
      expect(text).toContain('American English File 3');
      expect(text).toContain('B1-B2');
      expect(text).toContain('topic: Shopping');
      expect(text).toContain('deadline');
    });

    it('links what the learner keeps to that lesson, like any teacher notes', async () => {
      const list = (await alice.get(`${API}/teacher-sessions`)).body as { id: string; title: string }[];
      const session = list.find((s) => s.title.startsWith('AI suggestions'))!;
      const detail = (await alice.get(`${API}/teacher-sessions/${session.id}`)).body;
      const material = detail.materials[0];
      const full = (await alice.get(`${API}/teacher-materials/${material.id}`)).body;
      const { known: _k, ...first } = full.draft.items[0];
      await alice.post(`${API}/teacher-materials/${material.id}/commit`).send({ items: [first], exercises: [] }).expect(200);

      const kept = (await alice.get(`${API}/items`)).body.items.find((i: { headword: string }) => i.headword === first.headword);
      expect(kept.lessons.map((l: { id: string }) => l.id)).toEqual([namedLesson]);
    });

    it('asks what the lesson is about when it only has a neutral name', async () => {
      const res = await alice.post(`${API}/lessons/${neutralLesson}/suggest-content`).send({}).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors[0].path).toBe('topic');
    });

    it('works with a topic from the learner, and the focus is passed on', async () => {
      const res = await alice.post(`${API}/lessons/${neutralLesson}/suggest-content`).send({ topic: 'Business meetings', focus: 'COLLOCATION' }).expect(200);
      expect(res.body.itemCount).toBe(3);
      const text = String(ai.calls.at(-1)!.messages.at(-1)!.content);
      expect(text).toContain('topic: Business meetings');
      expect(text).toMatch(/COLLOCATION/);
      const material = (await alice.get(`${API}/teacher-materials/${res.body.materialId}`)).body;
      expect(material.title).toContain('Business meetings');
    });

    it('validates the request', async () => {
      await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({ focus: 'NOPE' }).expect(400);
      await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({ topic: 'x' }).expect(400);
      await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({ extra: 1 }).expect(400);
    });

    it('does not touch another learner’s lesson', async () => {
      await bob.post(`${API}/lessons/${namedLesson}/suggest-content`).send({ topic: 'Business meetings' }).expect(404);
    });

    it('says so when the AI has nothing new', async () => {
      ai.setResponder(() => ({ summary: 'None.', items: [word('deadline', 'مهلت')], exercises: [] }));
      const res = await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({}).expect(409);
      expect(res.body.detail).toMatch(/nothing new/i);
      ai.setResponder((req) => (req.schemaName === 'item_explanation' ? EXPLANATION : SUGGESTIONS));
    });

    it('creates nothing when the AI is not set up', async () => {
      const sessions = await ctx.prisma.teacherSession.count();
      ai.isConfigured = false;
      const res = await alice.post(`${API}/lessons/${namedLesson}/suggest-content`).send({}).expect(503);
      expect(res.body.code).toBe('AI_NOT_CONFIGURED');
      ai.isConfigured = true;
      expect(await ctx.prisma.teacherSession.count()).toBe(sessions);
    });
  });
});
