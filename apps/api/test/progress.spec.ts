import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AchievementsDto,
  AssessmentDto,
  AssessmentResultDto,
  AssessmentSummaryDto,
  DailySessionDto,
  ProgressDto,
  SessionResultDto,
} from '@coach/contracts';
import { toLocalDate } from '@coach/domain';
import { answerFor } from './answers.js';
import { API, createIntegrationApp, hasDatabase, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

describe.skipIf(!hasDatabase())('progress and achievements (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;
  let aliceId: string;
  let bookId: string;
  let lessonId: string;
  let unitId: string;

  const progress = async (agent: Agent, days = 30) => (await agent.get(`${API}/progress?days=${days}`).expect(200)).body as ProgressDto;
  const achievements = async (agent: Agent) => (await agent.get(`${API}/achievements`).expect(200)).body as AchievementsDto;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
    aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('before anything has happened', () => {
    it('shows an empty, well-formed report', async () => {
      const p = await progress(alice, 7);
      expect(p.days).toBe(7);
      expect(p.daily).toHaveLength(7);
      expect(p.daily.at(-1)!.date).toBe(p.today);
      expect(p.totals).toMatchObject({ activeMinutes: 0, sessions: 0, attempts: 0, accuracy: null, xp: 0, quizzes: 0, avgQuizScore: null });
      expect(p.statuses).toEqual({ new: 0, learning: 0, review: 0, mastered: 0, weak: 0, total: 0 });
      expect(p.level).toMatchObject({ level: 1, total: 0 });
      expect(p.books).toEqual([]);
      expect(p.week.thisWeek).toMatchObject({ minutes: 0, accuracy: null, newItems: 0 });
    });

    it('asks for a range it understands', async () => {
      await alice.get(`${API}/progress?days=5`).expect(400);
      await alice.get(`${API}/progress?days=abc`).expect(400);
      expect((await alice.get(`${API}/progress`).expect(200)).body.days).toBe(30);
      expect((await progress(alice, 90)).daily).toHaveLength(90);
    });

    it('lists every achievement with nothing earned', async () => {
      const a = await achievements(alice);
      expect(a.unlocked).toBe(0);
      expect(a.total).toBeGreaterThanOrEqual(15);
      expect(a.achievements.every((x) => x.unlockedAt === null && x.progress < x.target)).toBe(true);
      expect(a.newlyUnlocked).toEqual([]);
    });

    it('needs a signed-in learner', async () => {
      const { default: request } = await import('supertest');
      await request(ctx.server).get(`${API}/progress`).expect(401);
      await request(ctx.server).get(`${API}/achievements`).expect(401);
    });
  });

  describe('after learning', () => {
    let session: DailySessionDto;
    let sessionResult: SessionResultDto;

    beforeAll(async () => {
      const book = (await alice.post(`${API}/books`).send({ title: 'American English File 3' }).expect(201)).body;
      bookId = book.id;
      await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8A Shopping\n8B Business' }).expect(200);
      const detail = (await alice.get(`${API}/books/${book.id}`)).body;
      lessonId = detail.units[0].lessons[0].id;
      unitId = detail.units[0].id;
      await alice.put(`${API}/me/current-lesson`).send({ lessonId }).expect(200);
      for (const [headword, meaningFa] of [
        ['shopping', 'خرید'],
        ['customer', 'مشتری'],
        ['invoice', 'فاکتور'],
        ['budget', 'بودجه'],
        ['profit', 'سود'],
      ]) {
        await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword, meaningFa, lessonIds: [lessonId] }).expect(201);
      }
      // One item that is in the library but never practised.
      await alice.post(`${API}/items`).send({ type: 'GRAMMAR', headword: 'Reported speech', payload: { structure: 'say that', examples: [] } }).expect(201);
    });

    it('a finished session unlocks "First steps" and says so in its result', async () => {
      session = (await alice.post(`${API}/daily-sessions`).send({}).expect(200)).body.session;
      expect(session.exercises.length).toBeGreaterThan(2);
      for (const [i, ex] of session.exercises.entries()) {
        await alice
          .post(`${API}/attempts`)
          .send({
            clientAttemptId: randomUUID(),
            exerciseId: ex.id,
            sessionItemId: ex.sessionItemId,
            response: await answerFor(ctx.prisma, ex.id, i % 4 !== 3),
            durationMs: 15_000,
          })
          .expect(200);
      }
      sessionResult = (await alice.post(`${API}/daily-sessions/${session.id}/complete`).expect(200)).body;
      expect(sessionResult.newAchievements.map((a) => a.code)).toContain('FIRST_SESSION');
      expect(sessionResult.newAchievements[0]).toMatchObject({ title: expect.any(String), description: expect.any(String), icon: expect.any(String) });
    });

    it('shows the same celebration if the result is fetched again, and does not announce it twice', async () => {
      const again = (await alice.post(`${API}/daily-sessions/${session.id}/complete`).expect(200)).body as SessionResultDto;
      expect(again.newAchievements.map((a) => a.code)).toEqual(sessionResult.newAchievements.map((a) => a.code));
      const page = await achievements(alice);
      expect(page.newlyUnlocked).toEqual([]); // the page only announces what it finds new
      const first = page.achievements.find((a) => a.code === 'FIRST_SESSION')!;
      expect(first.unlockedAt).not.toBeNull();
      expect(first.progress).toBe(first.target);
      expect(page.unlocked).toBeGreaterThanOrEqual(1);
      expect(await ctx.prisma.userAchievement.count({ where: { userId: aliceId, code: 'FIRST_SESSION' } })).toBe(1);
    });

    it('lists earned achievements first, the closest to earning next', async () => {
      const page = await achievements(alice);
      const earned = page.achievements.filter((a) => a.unlockedAt);
      expect(page.achievements.slice(0, earned.length).every((a) => a.unlockedAt)).toBe(true);
      const rest = page.achievements.slice(earned.length).map((a) => a.progress / a.target);
      expect([...rest].sort((a, b) => b - a)).toEqual(rest);
    });

    it('counts today’s work in the report', async () => {
      const p = await progress(alice, 7);
      const today = p.daily.at(-1)!;
      expect(today.attempts).toBe(session.exercises.length);
      expect(today.minutes).toBeGreaterThanOrEqual(1);
      expect(today.sessions).toBe(1);
      expect(today.xp).toBeGreaterThan(0);
      expect(p.totals).toMatchObject({ sessions: 1, attempts: session.exercises.length });
      expect(p.totals.accuracy).toBeGreaterThan(0);
      expect(p.totals.accuracy).toBeLessThan(1); // one answer in four was wrong on purpose
      expect(p.streak).toMatchObject({ current: 1, longest: 1 });
      expect(p.level.total).toBe(p.totals.xp);
    });

    it('splits the library by status, counting unpractised items as new', async () => {
      const p = await progress(alice);
      expect(p.statuses.total).toBe(6);
      expect(p.statuses.new + p.statuses.learning + p.statuses.review + p.statuses.mastered).toBe(6);
      expect(p.statuses.new).toBeGreaterThanOrEqual(1); // the grammar point was never practised
      expect(p.statuses.learning + p.statuses.review).toBeGreaterThanOrEqual(1);
    });

    it('groups by type and by book and unit', async () => {
      const p = await progress(alice);
      expect(p.types.map((t) => t.type).sort()).toEqual(['GRAMMAR', 'VOCABULARY']);
      const vocab = p.types.find((t) => t.type === 'VOCABULARY')!;
      expect(vocab.items).toBe(5);
      expect(vocab.seen).toBeGreaterThanOrEqual(1);
      expect(vocab.avgMastery).toBeGreaterThan(0);
      expect(vocab.avgMastery).toBeLessThanOrEqual(1);

      expect(p.books).toHaveLength(1);
      const book = p.books[0]!;
      expect(book).toMatchObject({ bookId, title: 'American English File 3', items: 5 });
      expect(book.seen).toBeGreaterThanOrEqual(1);
      expect(book.units).toHaveLength(1);
      expect(book.units[0]).toMatchObject({ unitId, number: 8, items: 5 });
    });

    it('compares this week with last week', async () => {
      const { thisWeek, lastWeek } = (await progress(alice)).week;
      expect(thisWeek.attempts).toBe(session.exercises.length);
      expect(thisWeek.activeDays).toBe(1);
      expect(thisWeek.newItems).toBeGreaterThanOrEqual(1);
      expect(lastWeek).toMatchObject({ attempts: 0, minutes: 0, accuracy: null, newItems: 0 });
    });

    it('puts days in the learner’s own calendar, and older days stay out of a short range', async () => {
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: aliceId } });
      const old = new Date(Date.now() - 20 * 86_400_000);
      await ctx.prisma.dailyActivity.create({
        data: { userId: aliceId, localDate: new Date(`${toLocalDate(old, user.timezone)}T00:00:00Z`), attempts: 4, correct: 3, activeSeconds: 600, xp: 40, sessionsCompleted: 1 },
      });
      expect((await progress(alice, 7)).totals.sessions).toBe(1);
      const month = await progress(alice, 30);
      expect(month.totals.sessions).toBe(2);
      expect(month.totals.activeDays).toBe(2);
      expect(month.totals.activeMinutes).toBeGreaterThanOrEqual(11);
    });

    it('keeps one learner’s progress away from another’s', async () => {
      const p = await progress(bob);
      expect(p.books).toEqual([]);
      expect(p.statuses.total).toBe(0);
      expect(p.totals.attempts).toBe(0);
      expect((await achievements(bob)).unlocked).toBe(0);
    });
  });

  describe('quizzes and exams', () => {
    it('unlock "Quiz time" and appear in the report', async () => {
      const summary = (await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId }).expect(201)).body as AssessmentSummaryDto;
      const dto = (await alice.post(`${API}/assessments/${summary.id}/start`).expect(200)).body as AssessmentDto;
      for (const q of dto.questions) {
        await alice
          .put(`${API}/assessments/${summary.id}/questions/${q.id}/answer`)
          .send({ response: await answerFor(ctx.prisma, q.exercise.id, true), durationMs: 5000 })
          .expect(200);
      }
      const result = (await alice.post(`${API}/assessments/${summary.id}/submit`).expect(200)).body as AssessmentResultDto;
      expect(result.newAchievements.map((a) => a.code)).toContain('FIRST_QUIZ');

      // The result page shows them again later.
      const later = (await alice.get(`${API}/assessments/${summary.id}/result`)).body as AssessmentResultDto;
      expect(later.newAchievements.map((a) => a.code)).toEqual(result.newAchievements.map((a) => a.code));

      const p = await progress(alice);
      expect(p.totals.quizzes).toBe(1);
      expect(p.totals.avgQuizScore).toBeCloseTo(result.score);
      expect(p.recentAssessments[0]).toMatchObject({ id: summary.id, kind: 'QUIZ' });
      expect((await achievements(alice)).achievements.find((a) => a.code === 'FIRST_QUIZ')!.unlockedAt).not.toBeNull();
    });

    it('a quiz that unlocked nothing new says so', async () => {
      const summary = (await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId }).expect(201)).body as AssessmentSummaryDto;
      await alice.post(`${API}/assessments/${summary.id}/start`).expect(200);
      const result = (await alice.post(`${API}/assessments/${summary.id}/submit`).expect(200)).body as AssessmentResultDto;
      expect(result.newAchievements).toEqual([]);
    });
  });
});
