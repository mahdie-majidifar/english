import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssessmentSummaryDto, BookDetail, BookSummary, BookTemplateDto, ImportStructureResult } from '@coach/contracts';
import { API, createIntegrationApp, hasDatabase, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

describe.skipIf(!hasDatabase())('built-in books, units you can pick, practice and quizzes by unit (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;

  const templates = async (agent: Agent) => (await agent.get(`${API}/book-templates`).expect(200)).body as BookTemplateDto[];
  const detail = async (agent: Agent, id: string) => (await agent.get(`${API}/books/${id}`).expect(200)).body as BookDetail;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('the list', () => {
    it('offers American English File 3, 4 and 5 (third edition) and Collocations in Use Intermediate', async () => {
      const list = await templates(alice);
      expect(list.map((t) => t.key)).toEqual(['aef-3e-3', 'aef-3e-4', 'aef-3e-5', 'collocations-in-use-intermediate']);
      expect(list.filter((t) => t.series === 'American English File').map((t) => t.levelNumber)).toEqual([3, 4, 5]);
      expect(list.every((t) => t.bookId === null)).toBe(true);
    });

    it('describes the shape of each book honestly: lesson codes, no invented titles', async () => {
      const [aef, , , colloc] = await templates(alice);
      expect(aef).toMatchObject({ unitCount: 10, lessonCount: 30, hasTitles: false });
      expect(colloc).toMatchObject({ unitCount: 60, lessonCount: 60, hasTitles: false });
      expect(aef!.note).toMatch(/Paste/);
    });
  });

  describe('adding a book', () => {
    let aefId: string;

    it('creates the book with every unit and lesson, ready to pick from', async () => {
      const res = await alice.post(`${API}/book-templates/aef-3e-3/add`).expect(201);
      const book = res.body as BookSummary;
      aefId = book.id;
      expect(book).toMatchObject({ series: 'American English File', title: 'American English File 3 (Third Edition)', levelNumber: 3, unitCount: 10, lessonCount: 30 });

      const full = await detail(alice, book.id);
      expect(full.units.map((u) => u.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(full.units[7]!.lessons.map((l) => l.code)).toEqual(['8A', '8B', '8C']);
    });

    it('marks it as added, and refuses to add it twice', async () => {
      expect((await templates(alice)).find((t) => t.key === 'aef-3e-3')!.bookId).toBe(aefId);
      const again = await alice.post(`${API}/book-templates/aef-3e-3/add`).expect(409);
      expect(again.body.code).toBe('CONFLICT');
      expect((await alice.get(`${API}/books`)).body).toHaveLength(1);
    });

    it('does not mix learners up', async () => {
      expect((await templates(bob)).every((t) => t.bookId === null)).toBe(true);
      await bob.post(`${API}/book-templates/aef-3e-3/add`).expect(201);
      expect((await alice.get(`${API}/books`)).body).toHaveLength(1);
      await bob.get(`${API}/books/${aefId}`).expect(404);
    });

    it('rejects a book that is not in the list', async () => {
      await alice.post(`${API}/book-templates/nope/add`).expect(404);
    });

    it('lets the learner add the other books too', async () => {
      await alice.post(`${API}/book-templates/collocations-in-use-intermediate/add`).expect(201);
      await alice.post(`${API}/book-templates/aef-3e-4/add`).expect(201);
      expect((await alice.get(`${API}/books`)).body).toHaveLength(3);
    });
  });

  describe('naming the lessons from the learner’s own copy', () => {
    it('replaces the neutral names, but never a name the learner wrote', async () => {
      const book = (await alice.get(`${API}/books`)).body.find((b: BookSummary) => b.levelNumber === 3) as BookSummary;
      const before = await detail(alice, book.id);
      const lesson8c = before.units[7]!.lessons[2]!;
      await alice.patch(`${API}/lessons/${lesson8c.id}`).send({ code: '8C', title: 'My own name' }).expect(204);

      const res = await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: 'Unit 8 Money\n8A Shopping\n8B Business\n8C Something else' }).expect(200);
      const result = res.body as ImportStructureResult;
      expect(result).toMatchObject({ lessonsCreated: 0, lessonsRenamed: 2, lessonsSkipped: 1, unitsCreated: 0 });

      const after = await detail(alice, book.id);
      expect(after.units[7]!.title).toBe('Money');
      expect(after.units[7]!.lessons.map((l) => l.title)).toEqual(['Shopping', 'Business', 'My own name']);
    });

    it('names the units of a one-lesson-per-unit book from a pasted list', async () => {
      const book = (await alice.get(`${API}/books`)).body.find((b: BookSummary) => b.title.includes('Collocations')) as BookSummary;
      const res = await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '1 Describing people\n2 Appearance' }).expect(200);
      expect(res.body.lessonsRenamed).toBe(2);
      const after = await detail(alice, book.id);
      expect(after.units[0]!.title).toBe('Describing people');
      expect(after.units[0]!.lessons[0]!.title).toBe('Describing people');
      expect(after.units[2]!.lessons[0]!.title).toBe('Unit 3'); // not pasted: still neutral
    });
  });

  describe('practising and testing any unit or lesson', () => {
    let book: BookDetail;
    let unit8: BookDetail['units'][number];
    let unit9: BookDetail['units'][number];

    beforeAll(async () => {
      const summary = (await alice.get(`${API}/books`)).body.find((b: BookSummary) => b.levelNumber === 3) as BookSummary;
      book = await detail(alice, summary.id);
      unit8 = book.units[7]!;
      unit9 = book.units[8]!;
      const add = (headword: string, meaningFa: string, lessonId: string) =>
        alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword, meaningFa, lessonIds: [lessonId] }).expect(201);
      await add('shopping', 'خرید', unit8.lessons[0]!.id);
      await add('customer', 'مشتری', unit8.lessons[0]!.id);
      await add('invoice', 'فاکتور', unit8.lessons[1]!.id);
      await add('budget', 'بودجه', unit8.lessons[1]!.id);
      await add('profit', 'سود', unit8.lessons[2]!.id);
      await add('travel', 'سفر', unit9.lessons[0]!.id);
      await add('luggage', 'چمدان', unit9.lessons[0]!.id);
      await add('passport', 'گذرنامه', unit9.lessons[1]!.id);
    });

    const heads = (run: { exercises: { items: { headword: string }[] }[] }) =>
      new Set(run.exercises.flatMap((e) => e.items.map((i) => i.headword)));

    it('practises one lesson without making it the current one', async () => {
      const run = (await alice.post(`${API}/practice`).send({ scope: 'lesson', lessonId: unit8.lessons[1]!.id, count: 6 }).expect(200)).body;
      expect(run.scopeLabel).toContain('8B');
      expect([...heads(run)].sort()).toEqual(['budget', 'invoice']);
      expect((await alice.get(`${API}/me/current`)).body.current).toBeNull();
    });

    it('practises a whole unit: every lesson in it, nothing from another unit', async () => {
      const run = (await alice.post(`${API}/practice`).send({ scope: 'unit', unitId: unit8.id, count: 10 }).expect(200)).body;
      expect(run.scopeLabel).toMatch(/^Unit 8/);
      expect([...heads(run)].sort()).toEqual(['budget', 'customer', 'invoice', 'profit', 'shopping']);
    });

    it('asks for a unit to be chosen, and does not open anyone else’s', async () => {
      await alice.post(`${API}/practice`).send({ scope: 'unit', count: 5 }).expect(400);
      await bob.post(`${API}/practice`).send({ scope: 'unit', unitId: unit8.id, count: 5 }).expect(404);
      await bob.post(`${API}/practice`).send({ scope: 'lesson', lessonId: unit8.lessons[0]!.id, count: 5 }).expect(404);
    });

    it('quizzes a chosen lesson and examines a chosen unit, with no current lesson set', async () => {
      const quiz = (await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId: unit8.lessons[1]!.id }).expect(201)).body as AssessmentSummaryDto;
      expect(quiz.title).toContain('8B');
      const quizDto = (await alice.get(`${API}/assessments/${quiz.id}`)).body;
      const quizItems = new Set(quizDto.questions.flatMap((q: { exercise: { items: { headword: string }[] } }) => q.exercise.items.map((i) => i.headword)));
      expect([...quizItems].sort()).toEqual(['budget', 'invoice']);

      const exam = (await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'UNIT', unitId: unit9.id }).expect(201)).body as AssessmentSummaryDto;
      expect(exam.title).toContain('Unit 9');
      const examDto = (await alice.get(`${API}/assessments/${exam.id}`)).body;
      const examItems = new Set(examDto.questions.flatMap((q: { exercise: { items: { headword: string }[] } }) => q.exercise.items.map((i) => i.headword)));
      expect([...examItems].sort()).toEqual(['luggage', 'passport', 'travel']);
    });

    it('does not accept a lesson with the unit preset or the other way round', async () => {
      await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'UNIT', lessonId: unit8.lessons[0]!.id }).expect(400);
      await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', unitId: unit8.id }).expect(400);
    });

    it('does not let one learner test another learner’s lesson', async () => {
      await bob.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId: unit8.lessons[0]!.id }).expect(404);
      await bob.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'UNIT', unitId: unit8.id }).expect(404);
    });

    it('says plainly when a lesson has nothing in it yet', async () => {
      const empty = unit9.lessons[2]!;
      const res = await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId: empty.id }).expect(409);
      expect(res.body.detail).toMatch(/no items/i);
      const run = (await alice.post(`${API}/practice`).send({ scope: 'lesson', lessonId: empty.id, count: 5 }).expect(200)).body;
      expect(run.exercises).toEqual([]);
    });
  });
});
