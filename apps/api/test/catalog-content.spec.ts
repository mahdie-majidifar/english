import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API,
  createIntegrationApp,
  hasDatabase,
  resetDatabase,
  signedInAgent,
  type TestContext,
} from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

describe.skipIf(!hasDatabase())('catalog and content (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;

  let bookId: string;
  let lesson8A: string;
  let lesson8B: string;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('books, units and lessons', () => {
    it('creates a book and imports a pasted table of contents', async () => {
      const created = await alice
        .post(`${API}/books`)
        .send({ series: 'American English File', title: 'American English File 3', levelNumber: 3, cefr: 'B1' })
        .expect(201);
      bookId = created.body.id;
      expect(created.body).toMatchObject({ title: 'American English File 3', unitCount: 0, isCurrent: false });

      const imported = await alice
        .post(`${API}/books/${bookId}/import-structure`)
        .send({ text: 'Unit 8: Money\n8A Shopping\n8B - Business\n9A Weather\nrandom heading' })
        .expect(200);
      expect(imported.body).toMatchObject({
        unitsCreated: 2,
        lessonsCreated: 3,
        lessonsSkipped: 0,
        rejected: ['random heading'],
      });

      const detail = await alice.get(`${API}/books/${bookId}`).expect(200);
      expect(detail.body.units.map((u: { number: number }) => u.number)).toEqual([8, 9]);
      expect(detail.body.units[0].title).toBe('Money');
      const lessons = detail.body.units[0].lessons as { id: string; code: string }[];
      lesson8A = lessons.find((l) => l.code === '8A')!.id;
      lesson8B = lessons.find((l) => l.code === '8B')!.id;
    });

    it('re-importing is safe: existing lessons are skipped, nothing is duplicated', async () => {
      const again = await alice
        .post(`${API}/books/${bookId}/import-structure`)
        .send({ text: '8A Shopping\n8C Something new' })
        .expect(200);
      expect(again.body).toMatchObject({ unitsCreated: 0, lessonsCreated: 1, lessonsSkipped: 1 });
    });

    it('rejects duplicate unit numbers and lesson codes with 409', async () => {
      const units = (await alice.get(`${API}/books/${bookId}`)).body.units as { id: string }[];
      await alice.post(`${API}/books/${bookId}/units`).send({ number: 8 }).expect(409);
      await alice.post(`${API}/units/${units[0]!.id}/lessons`).send({ code: '8a', title: 'Dup' }).expect(409);
    });

    it('validates input', async () => {
      const res = await alice.post(`${API}/books`).send({ title: '' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      await alice.get(`${API}/books/not-a-uuid`).expect(400);
    });

    it("keeps one learner's catalog invisible and untouchable to another", async () => {
      expect((await bob.get(`${API}/books`).expect(200)).body).toEqual([]);
      await bob.get(`${API}/books/${bookId}`).expect(404);
      await bob.patch(`${API}/books/${bookId}`).send({ title: 'hijacked' }).expect(404);
      await bob.delete(`${API}/books/${bookId}`).expect(404);
      await bob.post(`${API}/books/${bookId}/units`).send({ number: 20 }).expect(404);
      await bob.put(`${API}/me/current-lesson`).send({ lessonId: lesson8A }).expect(404);
    });

    it('tracks the current lesson', async () => {
      expect((await alice.get(`${API}/me/current`).expect(200)).body).toEqual({ current: null });

      const set = await alice.put(`${API}/me/current-lesson`).send({ lessonId: lesson8B }).expect(200);
      expect(set.body).toMatchObject({
        book: { title: 'American English File 3' },
        unit: { number: 8, title: 'Money' },
        lesson: { code: '8B', title: 'Business' },
      });

      const books = (await alice.get(`${API}/books`)).body;
      expect(books[0].isCurrent).toBe(true);
      const detail = (await alice.get(`${API}/books/${bookId}`)).body;
      const flat = detail.units.flatMap((u: { lessons: { code: string; isCurrent: boolean }[] }) => u.lessons);
      expect(flat.filter((l: { isCurrent: boolean }) => l.isCurrent).map((l: { code: string }) => l.code)).toEqual(['8B']);
    });
  });

  describe('learning items', () => {
    const create = (agent: Agent, body: Record<string, unknown>) => agent.post(`${API}/items`).send(body);

    it('creates a word linked to lessons, with a validated payload', async () => {
      const res = await create(alice, {
        type: 'VOCABULARY',
        headword: 'negotiate',
        meaningEn: 'to discuss something to reach an agreement',
        meaningFa: 'مذاکره کردن',
        lessonIds: [lesson8B],
        payload: { partOfSpeech: 'verb', examples: ['We negotiated a discount.'] },
      }).expect(201);
      expect(res.body).toMatchObject({
        type: 'VOCABULARY',
        headword: 'negotiate',
        status: 'NEW',
        source: 'USER',
        lessons: [{ code: '8B', unitNumber: 8, bookTitle: 'American English File 3' }],
      });
      expect(res.body.payload.examples).toEqual(['We negotiated a discount.']);
    });

    it('rejects a payload that does not fit its type, pointing at the field', async () => {
      const res = await create(alice, {
        type: 'IRREGULAR_VERB',
        headword: 'wear',
        payload: { base: 'wear', past: 'wore' },
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('payload.pastParticiple');
    });

    it('treats the same word as a duplicate regardless of case and spacing', async () => {
      const res = await create(alice, { type: 'VOCABULARY', headword: '  Negotiate. ' }).expect(409);
      expect(res.body.code).toBe('CONFLICT');
      // The same headword under another type is a different item.
      await create(alice, { type: 'EXPRESSION', headword: 'negotiate' }).expect(201);
    });

    it("does not let a learner link items to someone else's lessons", async () => {
      await create(bob, { type: 'VOCABULARY', headword: 'steal', lessonIds: [lesson8A] }).expect(404);
    });

    it('stores richer types: word distinctions and irregular verbs', async () => {
      await create(alice, {
        type: 'WORD_DISTINCTION',
        headword: 'fit / suit / match',
        lessonIds: [lesson8A],
        payload: {
          members: ['fit', 'suit', 'match'],
          distinctions: [{ word: 'fit', usageFa: 'اندازه بودن', example: 'These shoes fit me.' }],
        },
      }).expect(201);
      await create(alice, {
        type: 'IRREGULAR_VERB',
        headword: 'wear',
        payload: { base: 'wear', past: 'wore', pastParticiple: 'worn' },
      }).expect(201);
    });

    it('lists with filters, counts per type, and search', async () => {
      const all = (await alice.get(`${API}/items`).expect(200)).body;
      expect(all.items).toHaveLength(4);
      expect(all.counts).toMatchObject({ VOCABULARY: 1, EXPRESSION: 1, WORD_DISTINCTION: 1, IRREGULAR_VERB: 1 });

      const vocab = (await alice.get(`${API}/items?type=VOCABULARY`)).body;
      expect(vocab.items.map((i: { headword: string }) => i.headword)).toEqual(['negotiate']);
      // Counts ignore the type filter so the tabs keep their badges.
      expect(vocab.counts.IRREGULAR_VERB).toBe(1);

      const inLesson = (await alice.get(`${API}/items?lessonId=${lesson8A}`)).body;
      expect(inLesson.items.map((i: { headword: string }) => i.headword)).toEqual(['fit / suit / match']);

      const inUnit = (await alice.get(`${API}/items?bookId=${bookId}`)).body;
      expect(inUnit.items).toHaveLength(2);

      const byPersian = (await alice.get(`${API}/items?q=${encodeURIComponent('مذاکره')}`)).body;
      expect(byPersian.items.map((i: { headword: string }) => i.headword)).toEqual(['negotiate']);

      const search = (await alice.get(`${API}/search?q=NEGO`).expect(200)).body;
      expect(search.results.length).toBeGreaterThanOrEqual(2);
      expect(search.results[0].headword).toBe('negotiate');
    });

    it('paginates with a cursor', async () => {
      const first = (await alice.get(`${API}/items?limit=3`)).body;
      expect(first.items).toHaveLength(3);
      expect(first.nextCursor).toBeTruthy();
      const second = (await alice.get(`${API}/items?limit=3&cursor=${first.nextCursor}`)).body;
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((i: { id: string }) => i.id);
      expect(new Set(ids).size).toBe(4);
    });

    it('counts an item once per book even when it appears in two lessons', async () => {
      const item = (await alice.get(`${API}/items?type=VOCABULARY`)).body.items[0];
      await alice.patch(`${API}/items/${item.id}`).send({ lessonIds: [lesson8A, lesson8B] }).expect(200);
      const books = (await alice.get(`${API}/books`)).body;
      expect(books[0].itemCount).toBe(2); // negotiate + fit/suit/match, not 3
    });

    it('updates fields, validates the payload against the stored type, and guards duplicates', async () => {
      const item = (await alice.get(`${API}/items?type=IRREGULAR_VERB`)).body.items[0];

      const ok = await alice.patch(`${API}/items/${item.id}`).send({ meaningFa: 'پوشیدن' }).expect(200);
      expect(ok.body.meaningFa).toBe('پوشیدن');

      await alice.patch(`${API}/items/${item.id}`).send({ payload: { base: 'wear' } }).expect(400);
      await alice.patch(`${API}/items/${item.id}`).send({ type: 'GRAMMAR' }).expect(400); // type is immutable

      const other = (await alice.get(`${API}/items?type=EXPRESSION`)).body.items[0];
      await alice.patch(`${API}/items/${other.id}`).send({ headword: 'negotiate' }).expect(200); // other type: fine
      await create(alice, { type: 'IRREGULAR_VERB', headword: 'wake', payload: { base: 'wake', past: 'woke', pastParticiple: 'woken' } }).expect(201);
      await alice.patch(`${API}/items/${item.id}`).send({ headword: 'wake' }).expect(409);
    });

    it("hides other learners' items completely", async () => {
      const item = (await alice.get(`${API}/items`)).body.items[0];
      expect((await bob.get(`${API}/items`).expect(200)).body.items).toEqual([]);
      await bob.get(`${API}/items/${item.id}`).expect(404);
      await bob.patch(`${API}/items/${item.id}`).send({ meaningFa: 'x' }).expect(404);
      await bob.delete(`${API}/items/${item.id}`).expect(404);
      expect((await bob.get(`${API}/search?q=negotiate`)).body.results).toEqual([]);
    });

    it('archives items, and re-adding an archived word restores it', async () => {
      const wake = (await alice.get(`${API}/search?q=wake`)).body.results[0];
      await alice.delete(`${API}/items/${wake.id}`).expect(204);
      await alice.get(`${API}/items/${wake.id}`).expect(404);
      expect((await alice.get(`${API}/search?q=wake`)).body.results).toEqual([]);

      const restored = await create(alice, {
        type: 'IRREGULAR_VERB',
        headword: 'wake',
        meaningFa: 'بیدار شدن',
        payload: { base: 'wake', past: 'woke', pastParticiple: 'woken' },
      }).expect(201);
      expect(restored.body.id).toBe(wake.id);
      expect(restored.body.meaningFa).toBe('بیدار شدن');
    });

    it('keeps items when their book is deleted, and drops only the lesson links', async () => {
      await alice.delete(`${API}/books/${bookId}`).expect(204);
      await alice.get(`${API}/books/${bookId}`).expect(404);
      const items = (await alice.get(`${API}/items`)).body.items as { lessons: unknown[] }[];
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.lessons.length === 0)).toBe(true);
      expect((await alice.get(`${API}/me/current`)).body).toEqual({ current: null });
    });
  });
});
