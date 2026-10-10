import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientExercise, DailySessionDto } from '@coach/contracts';
import { toLocalDate } from '@coach/domain';
import { answerFor } from './answers.js';
import {
  API,
  createIntegrationApp,
  hasDatabase,
  resetDatabase,
  signedInAgent,
  type TestContext,
} from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const DAY = 86_400_000;

describe.skipIf(!hasDatabase())('learning loop: scheduling, mistakes, daily session, progress (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;
  let aliceId: string;
  let lessonId: string;
  const itemId: Record<string, string> = {};

  const submit = (agent: Agent, exerciseId: string, response: unknown, extra: Record<string, unknown> = {}, clientAttemptId = randomUUID()) =>
    agent.post(`${API}/attempts`).send({ clientAttemptId, exerciseId, response, durationMs: 8000, ...extra });

  /** An exercise of a given format for an item, from the stored pool (created through a practice run). */
  async function exerciseFor(item: string, format: string) {
    await alice.post(`${API}/practice`).send({ scope: 'item', itemId: itemId[item], count: 5 }).expect(200);
    return ctx.prisma.exercise.findFirstOrThrow({
      where: { ownerId: aliceId, format, items: { some: { itemId: itemId[item], isPrimary: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  const stateOf = (item: string) =>
    ctx.prisma.userItemState.findUnique({ where: { userId_itemId: { userId: aliceId, itemId: itemId[item]! } } });

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
    aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id;

    const book = (await alice.post(`${API}/books`).send({ title: 'American English File 3' }).expect(201)).body;
    await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8B Business' }).expect(200);
    lessonId = (await alice.get(`${API}/books/${book.id}`)).body.units[0].lessons[0].id;
    await alice.put(`${API}/me/current-lesson`).send({ lessonId }).expect(200);

    const add = async (key: string, body: Record<string, unknown>) => {
      itemId[key] = (await alice.post(`${API}/items`).send({ lessonIds: [lessonId], ...body }).expect(201)).body.id;
    };
    await add('negotiate', { type: 'VOCABULARY', headword: 'negotiate', meaningFa: 'مذاکره کردن', payload: { examples: ['We negotiated a big discount yesterday.'] } });
    await add('strictly', { type: 'VOCABULARY', headword: 'strictly', meaningFa: 'به‌طور سخت‌گیرانه' });
    await add('weird', { type: 'VOCABULARY', headword: 'weird', meaningFa: 'عجیب' });
    await add('static', { type: 'VOCABULARY', headword: 'static', meaningFa: 'ثابت' });
    await add('wear', { type: 'IRREGULAR_VERB', headword: 'wear', meaningFa: 'پوشیدن', payload: { base: 'wear', past: 'wore', pastParticiple: 'worn' } });
    await add('fail', { type: 'WORD_FORMATION', headword: 'fail', payload: { base: 'fail', forms: [{ form: 'failure', pos: 'noun' }] } });
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('what an answer teaches the system', () => {
    it('schedules a first right answer for a later day, and updates mastery, XP and activity', async () => {
      const ex = await exerciseFor('strictly', 'multiple_choice');
      const res = await submit(alice, ex.id, await answerFor(ctx.prisma, ex.id, true)).expect(200);

      expect(res.body.xp).toBe(5); // a recognition exercise
      expect(res.body.itemUpdates).toHaveLength(1);
      expect(res.body.itemUpdates[0]).toMatchObject({ itemId: itemId['strictly'], status: 'LEARNING' });
      expect(res.body.itemUpdates[0].mastery).toBeGreaterThan(0);
      expect(new Date(res.body.itemUpdates[0].due).getTime() - Date.now()).toBeGreaterThan(DAY * 0.9);

      const state = (await stateOf('strictly'))!;
      expect(state).toMatchObject({ reps: 1, lapses: 0, status: 'LEARNING', currentLevel: 'RECOGNITION' });
      expect(state.stability).toBeGreaterThan(0);
      expect(state.firstSeenAt).toBeTruthy();
      expect(await ctx.prisma.reviewLog.count({ where: { userId: aliceId, itemId: itemId['strictly'] } })).toBe(1);

      const tz = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: aliceId } })).timezone;
      const today = new Date(`${toLocalDate(new Date(), tz)}T00:00:00Z`);
      const activity = await ctx.prisma.dailyActivity.findUniqueOrThrow({ where: { userId_localDate: { userId: aliceId, localDate: today } } });
      expect(activity).toMatchObject({ attempts: 1, correct: 1, xp: 5 });
      expect((await ctx.prisma.userGamification.findUniqueOrThrow({ where: { userId: aliceId } })).totalXp).toBe(5);
    });

    it('lets only the first answer of a day move the review schedule', async () => {
      const before = (await stateOf('strictly'))!;
      const pool = await ctx.prisma.exercise.findMany({ where: { ownerId: aliceId, items: { some: { itemId: itemId['strictly'], isPrimary: true } } } });
      const other = pool.find((e) => e.format === 'flashcard') ?? pool[0]!;
      await submit(alice, other.id, await answerFor(ctx.prisma, other.id, true)).expect(200);

      const after = (await stateOf('strictly'))!;
      expect(after.reps).toBe(before.reps);
      expect(after.due!.getTime()).toBe(before.due!.getTime());
      expect(await ctx.prisma.reviewLog.count({ where: { userId: aliceId, itemId: itemId['strictly'] } })).toBe(1);
      expect(after.accuracyEwma).toBeGreaterThan(0); // but accuracy still learns from it
    });

    it('does not count a retried request twice', async () => {
      const ex = await exerciseFor('weird', 'multiple_choice');
      const id = randomUUID();
      const response = await answerFor(ctx.prisma, ex.id, true);
      const xpBefore = (await ctx.prisma.userGamification.findUniqueOrThrow({ where: { userId: aliceId } })).totalXp;
      await submit(alice, ex.id, response, {}, id).expect(200);
      await submit(alice, ex.id, response, {}, id).expect(200);
      const xpAfter = (await ctx.prisma.userGamification.findUniqueOrThrow({ where: { userId: aliceId } })).totalXp;
      expect(xpAfter - xpBefore).toBe(5);
      expect((await stateOf('weird'))!.reps).toBe(1);
      expect(await ctx.prisma.reviewLog.count({ where: { itemId: itemId['weird'] } })).toBe(1);
    });

    it('brings the next review closer after a mistake than after a right answer', async () => {
      const right = await exerciseFor('static', 'multiple_choice');
      await submit(alice, right.id, await answerFor(ctx.prisma, right.id, true)).expect(200);
      const ok = (await stateOf('static'))!;

      const ex = await exerciseFor('fail', 'word_formation');
      await submit(alice, ex.id, await answerFor(ctx.prisma, ex.id, false)).expect(200);
      const bad = (await stateOf('fail'))!;
      expect(bad.due!.getTime()).toBeLessThanOrEqual(ok.due!.getTime());
      expect(bad.accuracyEwma).toBe(0);
    });

    it('moves an item up a level after three right answers in a row', async () => {
      await exerciseFor('negotiate', 'flashcard'); // makes sure this item's exercises exist
      const pool = await ctx.prisma.exercise.findMany({
        where: { ownerId: aliceId, items: { some: { itemId: itemId['negotiate'], isPrimary: true } } },
        orderBy: { createdAt: 'asc' },
      });
      expect(pool.length).toBeGreaterThanOrEqual(3);
      for (const ex of pool.slice(0, 3)) await submit(alice, ex.id, await answerFor(ctx.prisma, ex.id, true)).expect(200);
      const state = (await stateOf('negotiate'))!;
      expect(state.currentLevel).toBe('RECALL');
      expect(state.highestLevelPassed).toBe('RECOGNITION');
    });
  });

  describe('the mistake bank', () => {
    it('records what was answered and what was expected, and names the kind of error', async () => {
      const ex = await exerciseFor('wear', 'irregular_verb_forms');
      const res = await submit(alice, ex.id, { past: 'wore', pastParticiple: 'wore' }).expect(200);
      expect(res.body.errorCodes).toEqual(['VERB.V3_FORM']);

      const mistake = await ctx.prisma.mistake.findFirstOrThrow({
        where: { userId: aliceId, itemId: itemId['wear'] },
        include: { occurrenceLog: true },
      });
      expect(mistake).toMatchObject({ errorCode: 'VERB.V3_FORM', status: 'ACTIVE', occurrences: 1, correctDays: 0 });
      expect(mistake.priority).toBeGreaterThan(2.5); // a serious grammar-type error
      expect(mistake.occurrenceLog[0]).toMatchObject({ userAnswer: 'wore / wore', expectedAnswer: 'wear → wore → worn' });
    });

    it('counts a repeated error as one mistake with more occurrences and a higher priority', async () => {
      const before = await ctx.prisma.mistake.findFirstOrThrow({ where: { userId: aliceId, itemId: itemId['wear'] } });
      const ex = await exerciseFor('wear', 'irregular_verb_forms');
      await submit(alice, ex.id, { past: 'wore', pastParticiple: 'weared' }).expect(200);
      const rows = await ctx.prisma.mistake.findMany({ where: { userId: aliceId, itemId: itemId['wear'], errorCode: 'VERB.V3_FORM' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.occurrences).toBe(2);
      expect(rows[0]!.priority).toBeGreaterThan(before.priority);
    });

    it('flags an item with a serious mistake as weak', async () => {
      expect((await stateOf('wear'))!.isWeak).toBe(true);
    });

    it('lists open mistakes with labels, a "repeated" marker and what is needed to fix them', async () => {
      const list = (await alice.get(`${API}/mistakes`).expect(200)).body;
      const wear = list.find((m: { item: { headword: string } }) => m.item.headword === 'wear');
      expect(wear).toMatchObject({
        errorCode: 'VERB.V3_FORM',
        errorLabelEn: 'Past participle form (V3)',
        status: 'ACTIVE',
        occurrences: 2,
        priority: 'HIGH',
        correctDaysNeeded: 3,
      });
      expect(wear.recent[0]).toHaveProperty('userAnswer');
      expect(list[0].priority).toBe('HIGH'); // most serious first

      const summary = (await alice.get(`${API}/mistakes/summary`).expect(200)).body;
      expect(summary.active).toBeGreaterThanOrEqual(2);
    });

    it('is fixed by right answers on three different days, not by several on one day', async () => {
      const mistake = await ctx.prisma.mistake.findFirstOrThrow({ where: { userId: aliceId, itemId: itemId['wear'] } });
      const pool = await ctx.prisma.exercise.findMany({ where: { ownerId: aliceId, items: { some: { itemId: itemId['wear'], isPrimary: true } } } });
      const correct = async () => {
        const ex = pool[Math.floor(Math.random() * pool.length)]!;
        await submit(alice, ex.id, await answerFor(ctx.prisma, ex.id, true)).expect(200);
      };
      const reload = () => ctx.prisma.mistake.findUniqueOrThrow({ where: { id: mistake.id } });
      const yesterday = (n: number) => new Date(new Date(`${toLocalDate(new Date(), 'UTC')}T00:00:00Z`).getTime() - n * DAY);

      await correct();
      await correct(); // same day: counts once
      expect(await reload()).toMatchObject({ status: 'IMPROVING', correctDays: 1 });

      await ctx.prisma.mistake.update({ where: { id: mistake.id }, data: { lastCorrectDate: yesterday(2) } });
      await correct();
      expect(await reload()).toMatchObject({ status: 'IMPROVING', correctDays: 2 });

      await ctx.prisma.mistake.update({ where: { id: mistake.id }, data: { lastCorrectDate: yesterday(1) } });
      await correct();
      expect(await reload()).toMatchObject({ status: 'RESOLVED', correctDays: 3 });
      expect((await alice.get(`${API}/mistakes?status=open`)).body.some((m: { id: string }) => m.id === mistake.id)).toBe(false);
      expect((await alice.get(`${API}/mistakes?status=resolved`)).body.some((m: { id: string }) => m.id === mistake.id)).toBe(true);
    });

    it('reopens a fixed mistake if the error comes back', async () => {
      const ex = await exerciseFor('wear', 'irregular_verb_forms');
      await submit(alice, ex.id, { past: 'wore', pastParticiple: 'wore' }).expect(200);
      const m = await ctx.prisma.mistake.findFirstOrThrow({ where: { userId: aliceId, itemId: itemId['wear'], errorCode: 'VERB.V3_FORM' } });
      expect(m).toMatchObject({ status: 'ACTIVE', correctDays: 0, occurrences: 3 });
    });

    it("keeps each learner's mistakes private", async () => {
      expect((await bob.get(`${API}/mistakes`).expect(200)).body).toEqual([]);
      expect((await bob.get(`${API}/mistakes/summary`).expect(200)).body).toMatchObject({ active: 0, repeated: 0 });
    });

    it('is available as a practice scope, together with due and weak items', async () => {
      const mistakes = (await alice.post(`${API}/practice`).send({ scope: 'mistakes', count: 5 }).expect(200)).body;
      expect(mistakes.scopeLabel).toBe('My mistakes');
      expect(mistakes.exercises.length).toBeGreaterThan(0);

      const weak = (await alice.post(`${API}/practice`).send({ scope: 'weak', count: 5 }).expect(200)).body;
      expect(weak.exercises.some((e: ClientExercise) => e.items[0]!.headword === 'wear')).toBe(true);

      await ctx.prisma.userItemState.update({
        where: { userId_itemId: { userId: aliceId, itemId: itemId['strictly']! } },
        data: { due: new Date(Date.now() - DAY) },
      });
      const due = (await alice.post(`${API}/practice`).send({ scope: 'due', count: 5 }).expect(200)).body;
      expect(due.scopeLabel).toBe('Due for review');
      expect(due.exercises.some((e: ClientExercise) => e.items[0]!.headword === 'strictly')).toBe(true);
    });
  });

  describe('the daily session', () => {
    let session: DailySessionDto;

    beforeAll(async () => {
      // Some words from today's lesson that the learner has not met yet.
      for (const [headword, meaningFa] of [['conservative', 'محافظه‌کار'], ['disposable income', 'درآمد قابل تصرف'], ['impersonal', 'غیرشخصی']] as const) {
        await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword, meaningFa, lessonIds: [lessonId] }).expect(201);
      }
    });

    it('plans a session from reviews, mistakes and new items, with a reason for each exercise', async () => {
      const res = (await alice.post(`${API}/daily-sessions`).send({}).expect(200)).body;
      session = res.session;
      expect(session).toMatchObject({ status: 'PLANNED', ordinal: 1, answeredCount: 0 });
      expect(session.total).toBeGreaterThanOrEqual(3);
      expect(session.plannedSeconds).toBeGreaterThan(0);
      expect(session.plannedSeconds).toBeLessThanOrEqual(600);

      const reasons = new Set(session.exercises.map((e) => e.reason));
      expect(reasons.has('DUE_REVIEW')).toBe(true); // 'strictly' was made due above
      expect(reasons.has('MISTAKE') || reasons.has('WEAK_AREA')).toBe(true);
      expect(reasons.has('NEW_CONTENT')).toBe(true); // words from the current lesson
      expect(session.exercises.filter((e) => e.reason === 'NEW_CONTENT').length).toBeLessThanOrEqual(5);
      expect(session.summary.DUE_REVIEW).toBeGreaterThan(0);

      const items = session.exercises.map((e) => e.items[0]!.id);
      expect(new Set(items).size).toBe(items.length); // each item once
      const text = JSON.stringify(session);
      for (const secret of ['correctOptionId', 'acceptedAnswers', '"solution"', 'distractorErrors']) expect(text).not.toContain(secret);
    });

    it('orders the blocks sensibly and always states what to do', async () => {
      const order = ['WARM_UP', 'NEW_CONTENT', 'PRACTICE', 'CONTEXT', 'PRODUCTION', 'REVIEW'];
      const ranks = session.exercises.map((e) => order.indexOf(e.block));
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      for (const e of session.exercises) expect((e.content as { instruction: string }).instruction.length).toBeGreaterThan(5);
    });

    it('gives the same session back until it is finished', async () => {
      const again = (await alice.post(`${API}/daily-sessions`).send({}).expect(200)).body.session;
      expect(again.id).toBe(session.id);
      expect(again.exercises.map((e: ClientExercise) => e.id)).toEqual(session.exercises.map((e) => e.id));
      const today = (await alice.get(`${API}/daily-sessions/today`).expect(200)).body.session;
      expect(today).toMatchObject({ id: session.id, status: 'PLANNED', total: session.total, answeredCount: 0 });
      expect((await alice.get(`${API}/daily-sessions/${session.id}`).expect(200)).body.id).toBe(session.id);
    });

    it("cannot be seen or answered by another learner", async () => {
      await bob.get(`${API}/daily-sessions/${session.id}`).expect(404);
      await bob.post(`${API}/daily-sessions/${session.id}/complete`).expect(404);
      const first = session.exercises[0]!;
      await submit(bob, first.id, {}, { sessionItemId: first.sessionItemId }).expect(404);
    });

    it('cannot be finished before anything was answered', async () => {
      const res = await alice.post(`${API}/daily-sessions/${session.id}/complete`).expect(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    it('records answers against their slot, and starts the session', async () => {
      const first = session.exercises[0]!;
      const res = await submit(alice, first.id, await answerFor(ctx.prisma, first.id, true), { sessionItemId: first.sessionItemId }).expect(200);
      const attempt = await ctx.prisma.exerciseAttempt.findUniqueOrThrow({ where: { id: res.body.attemptId } });
      expect(attempt).toMatchObject({ context: 'DAILY_SESSION', sessionItemId: first.sessionItemId });

      const row = await ctx.prisma.dailySession.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.status).toBe('IN_PROGRESS');
      expect(row.startedAt).toBeTruthy();
      const view = (await alice.get(`${API}/daily-sessions/${session.id}`)).body as DailySessionDto;
      expect(view.answeredCount).toBe(1);
      expect(view.exercises[0]!.answered).toMatchObject({ isCorrect: true });
    });

    it('does not accept a slot twice, a slot for another exercise, or an unknown slot', async () => {
      const [first, second] = [session.exercises[0]!, session.exercises[1]!];
      await submit(alice, first.id, await answerFor(ctx.prisma, first.id, true), { sessionItemId: first.sessionItemId }).expect(409);
      await submit(alice, first.id, await answerFor(ctx.prisma, first.id, true), { sessionItemId: second.sessionItemId }).expect(404);
      await submit(alice, first.id, {}, { sessionItemId: randomUUID() }).expect(404);
    });

    it('finishes with a bonus, meets the daily goal, and starts the streak', async () => {
      // The first slot is answered already. Answer all but the last of the rest (one of them wrong).
      const middle = session.exercises.slice(1, -1);
      for (const [i, ex] of middle.entries()) {
        await submit(alice, ex.id, await answerFor(ctx.prisma, ex.id, i !== 0), { sessionItemId: ex.sessionItemId }).expect(200);
      }
      const answered = session.total - 1;
      const res = await alice.post(`${API}/daily-sessions/${session.id}/complete`).expect(200);
      expect(res.body).toMatchObject({ answered, wrong: 1 });
      expect(res.body.accuracy).toBeGreaterThan(0);
      expect(res.body.xpEarned).toBeGreaterThanOrEqual(30); // the bonus, plus the XP of the answers
      expect(res.body.streak).toEqual({ current: 1, longest: 1, goalMetToday: true });

      const events = await ctx.prisma.xpEvent.findMany({ where: { userId: aliceId, reason: { in: ['SESSION', 'GOAL'] } } });
      expect(events.map((e) => e.reason).sort()).toEqual(['GOAL', 'SESSION']);
      // What the summary shows is everything earned: answers, session bonus and goal bonus.
      const bonuses = events.reduce((sum, e) => sum + e.amount, 0);
      const attempts = await ctx.prisma.exerciseAttempt.findMany({ where: { sessionItem: { sessionId: session.id } } });
      const answersXp = attempts.reduce((sum, a) => sum + ((a.evaluation as { xp?: number }).xp ?? 0), 0);
      expect(res.body.xpEarned).toBe(bonuses + answersXp);
      const activity = await ctx.prisma.dailyActivity.findFirstOrThrow({ where: { userId: aliceId, sessionsCompleted: 1 } });
      expect(activity.goalMet).toBe(true);
    });

    it('is safe to finish twice, and takes no more answers once finished', async () => {
      const again = await alice.post(`${API}/daily-sessions/${session.id}/complete`).expect(200);
      expect(again.body.streak.current).toBe(1);
      expect(await ctx.prisma.xpEvent.count({ where: { userId: aliceId, reason: 'SESSION' } })).toBe(1);

      // The slot left unanswered can no longer be answered.
      const left = session.exercises[session.total - 1]!;
      const res = await submit(alice, left.id, await answerFor(ctx.prisma, left.id, true), { sessionItemId: left.sessionItemId }).expect(409);
      expect(res.body.detail).toMatch(/finished/);
      expect((await alice.post(`${API}/daily-sessions`).send({}).expect(200)).body.session).toMatchObject({ id: session.id, status: 'COMPLETED' });
    });
    it('plans an extra session on request', async () => {
      const extra = (await alice.post(`${API}/daily-sessions`).send({ extra: true }).expect(200)).body;
      if (extra.session) {
        expect(extra.session.ordinal).toBe(2);
        expect(extra.session.id).not.toBe(session.id);
      } else {
        expect(extra.reason).toBe('NOTHING_TO_PRACTICE');
      }
    });

    it('says honestly when there is nothing to practise', async () => {
      const res = await bob.post(`${API}/daily-sessions`).send({}).expect(200);
      expect(res.body).toEqual({ session: null, reason: 'NOTHING_TO_PRACTICE' });
    });

    it('avoids what was already practised today, and keeps validating input', async () => {
      await alice.post(`${API}/daily-sessions`).send({ extra: 'yes' }).expect(400);
      await alice.get(`${API}/daily-sessions/not-a-uuid`).expect(400);
    });
  });

  describe('dashboard', () => {
    it('summarises today, the streak, XP, weak areas, reviews and mistakes', async () => {
      const d = (await alice.get(`${API}/dashboard`).expect(200)).body;
      expect(d.today.session).toMatchObject({ total: expect.any(Number), plannedMinutes: expect.any(Number) });
      expect(d.today.goalMet).toBe(true);
      expect(d.today.goalMinutes).toBe(10);
      expect(d.current).toMatchObject({ lesson: { code: '8B' } });
      expect(d.streak).toEqual({ current: 1, longest: 1 });
      expect(d.xp.total).toBeGreaterThan(50);
      expect(d.xp.level).toBeGreaterThanOrEqual(1);
      expect(d.xp.intoLevel).toBeLessThan(d.xp.forLevel);

      expect(d.weakAreas.length).toBeGreaterThan(0);
      expect(d.weakAreas[0]).toMatchObject({ kind: 'error', label: 'Past participle form (V3)', labelFa: expect.any(String) });
      expect(d.weakAreas[0].items[0].headword).toBe('wear');

      expect(d.reviews.dueCount).toBeGreaterThanOrEqual(0);
      expect(d.reviews.upcoming.length).toBeGreaterThan(0);
      expect(d.mistakes.active).toBeGreaterThanOrEqual(1);
      expect(d.totals.items).toBe(9);
      expect(d.totals.new + d.totals.learning + d.totals.review + d.totals.mastered).toBe(9);
    });

    it('is empty and safe for a learner who has not started', async () => {
      const d = (await bob.get(`${API}/dashboard`).expect(200)).body;
      expect(d).toMatchObject({
        today: { session: null, activeMinutes: 0, goalMet: false },
        current: null,
        streak: { current: 0, longest: 0 },
        xp: { total: 0, level: 1 },
        weakAreas: [],
        reviews: { dueCount: 0, upcoming: [] },
        totals: { items: 0 },
      });
    });
  });

  describe('the learner’s own calendar day', () => {
    it('counts activity on the learner’s local date, not UTC', async () => {
      const carol = await signedInAgent(ctx, 'carol@example.com');
      const carolId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'carol@example.com' } })).id;
      await ctx.prisma.user.update({ where: { id: carolId }, data: { timezone: 'Pacific/Kiritimati' } }); // UTC+14

      await carol.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'solo', meaningFa: 'تنها' }).expect(201);
      const run = (await carol.post(`${API}/practice`).send({ scope: 'all', count: 3 }).expect(200)).body;
      const ex = run.exercises[0];
      await carol.post(`${API}/attempts`).send({ clientAttemptId: randomUUID(), exerciseId: ex.id, response: { rating: 3 }, durationMs: 4000 }).expect(200);

      const expected = toLocalDate(new Date(), 'Pacific/Kiritimati');
      const rows = await ctx.prisma.dailyActivity.findMany({ where: { userId: carolId } });
      expect(rows.map((r) => r.localDate.toISOString().slice(0, 10))).toEqual([expected]);
    });
  });
});
