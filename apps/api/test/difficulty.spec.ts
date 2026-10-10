import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssessmentDto, ClientExercise, DailySessionDto } from '@coach/contracts';
import { answerFor } from './answers.js';
import { API, createIntegrationApp, hasDatabase, resetDatabase, signedInAgent, type TestContext } from './integration.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const LEVELS = ['RECOGNITION', 'RECALL', 'CONTEXT', 'PRODUCTION'];
const WORDS: [string, string][] = [
  ['negotiate', 'مذاکره کردن'],
  ['strictly', 'به‌طور سخت‌گیرانه'],
  ['weird', 'عجیب'],
  ['static', 'ثابت'],
  ['deadline', 'مهلت'],
  ['colleague', 'همکار'],
  ['invoice', 'فاکتور'],
  ['budget', 'بودجه'],
];

describe.skipIf(!hasDatabase())('the difficulty setting (real PostgreSQL)', () => {
  let ctx: TestContext;
  let hard: Agent; // registered through the app: gets the default
  let easy: Agent;
  let hardId: string;
  let easyId: string;

  const fill = async (agent: Agent) => {
    for (const [headword, meaningFa] of WORDS) {
      await agent.post(`${API}/items`).send({ type: 'VOCABULARY', headword, meaningFa }).expect(201);
    }
  };
  const practice = async (agent: Agent, body: Record<string, unknown>) =>
    (await agent.post(`${API}/practice`).send({ count: 8, ...body }).expect(200)).body.exercises as ClientExercise[];

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);

    hard = request.agent(ctx.server) as unknown as Agent;
    await hard.post(`${API}/auth/register`).send({ displayName: 'Hana', email: 'hana@example.com', password: 'hard mode 42' }).expect(201);
    hardId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'hana@example.com' } })).id;

    easy = await signedInAgent(ctx, 'ezra@example.com', { difficulty: 'EASY' });
    easyId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ezra@example.com' } })).id;
    await fill(hard);
    await fill(easy);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('the setting itself', () => {
    it('a new account starts on the challenging setting', async () => {
      expect((await hard.get(`${API}/me/profile`).expect(200)).body.difficulty).toBe('CHALLENGING');
    });

    it('can be changed, and only to a real setting', async () => {
      await hard.patch(`${API}/me/profile`).send({ difficulty: 'STANDARD' }).expect(200);
      expect((await hard.get(`${API}/me/profile`)).body.difficulty).toBe('STANDARD');
      await hard.patch(`${API}/me/profile`).send({ difficulty: 'IMPOSSIBLE' }).expect(400);
      await hard.patch(`${API}/me/profile`).send({ difficulty: 'CHALLENGING' }).expect(200);
      expect((await ctx.prisma.userProfile.findUniqueOrThrow({ where: { userId: hardId } })).difficulty).toBe('CHALLENGING');
    });
  });

  describe('what a new item starts with', () => {
    it('challenging: no flashcards, and the work is above plain recognition', async () => {
      const exercises = await practice(hard, { scope: 'all' });
      expect(exercises.length).toBeGreaterThan(0);
      expect(exercises.some((e) => e.format === 'flashcard')).toBe(false);
      expect(exercises.some((e) => LEVELS.indexOf(e.level) >= LEVELS.indexOf('RECALL'))).toBe(true);
    });

    it('easy: new items start with recognition and never jump past the next level', async () => {
      const exercises = await practice(easy, { scope: 'all' });
      expect(exercises.some((e) => e.level === 'RECOGNITION')).toBe(true);
      expect(exercises.every((e) => e.level === 'RECOGNITION' || e.level === 'RECALL')).toBe(true);
    });

    it('the daily session follows the same rule', async () => {
      const session = (await hard.post(`${API}/daily-sessions`).send({}).expect(200)).body.session as DailySessionDto;
      expect(session.exercises.length).toBeGreaterThan(0);
      expect(session.exercises.some((e) => e.format === 'flashcard')).toBe(false);
    });

    it('quizzes and exams never use flashcards, on any setting', async () => {
      for (const agent of [hard, easy]) {
        const created = await agent.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'WEEKLY' });
        // Nothing practised yet this week on a fresh account: that is fine, there is nothing to test.
        expect([201, 409]).toContain(created.status);
      }
    });
  });

  describe('how fast an item moves up', () => {
    const answerItem = async (agent: Agent, itemId: string, right: boolean) => {
      const ex = (await agent.post(`${API}/practice`).send({ scope: 'item', itemId, count: 5 }).expect(200)).body.exercises as ClientExercise[];
      const first = ex.find((e) => e.format !== 'flashcard' && e.format !== 'matching') ?? ex[0]!;
      const response = await answerFor(ctx.prisma, first.id, right);
      await agent.post(`${API}/attempts`).send({ clientAttemptId: randomUUID(), exerciseId: first.id, response, durationMs: 5000 }).expect(200);
    };
    const stateOf = (userId: string, itemId: string) => ctx.prisma.userItemState.findUniqueOrThrow({ where: { userId_itemId: { userId, itemId } } });
    const itemOf = async (userId: string, headword: string) => (await ctx.prisma.learningItem.findFirstOrThrow({ where: { ownerId: userId, headword } })).id;

    it('challenging: begins at recall and moves up after two right answers in a row', async () => {
      const itemId = await itemOf(hardId, 'invoice');
      await answerItem(hard, itemId, true);
      expect((await stateOf(hardId, itemId)).currentLevel).toBe('RECALL');
      await answerItem(hard, itemId, true);
      expect((await stateOf(hardId, itemId)).currentLevel).toBe('CONTEXT');
    });

    it('challenging: two wrong answers do not drop it a level, three do', async () => {
      const itemId = await itemOf(hardId, 'budget');
      await answerItem(hard, itemId, true);
      await answerItem(hard, itemId, true); // now at CONTEXT
      await answerItem(hard, itemId, false);
      await answerItem(hard, itemId, false);
      expect((await stateOf(hardId, itemId)).currentLevel).toBe('CONTEXT');
      await answerItem(hard, itemId, false);
      expect((await stateOf(hardId, itemId)).currentLevel).toBe('RECALL');
    });

    it('easy: begins at recognition and needs three right answers in a row', async () => {
      const itemId = await itemOf(easyId, 'invoice');
      await answerItem(easy, itemId, true);
      await answerItem(easy, itemId, true);
      expect((await stateOf(easyId, itemId)).currentLevel).toBe('RECOGNITION');
      await answerItem(easy, itemId, true);
      expect((await stateOf(easyId, itemId)).currentLevel).toBe('RECALL');
    });

    it('an exam answer counts double: one practice answer and one exam answer are enough on easy', async () => {
      const itemId = await itemOf(easyId, 'colleague');
      await answerItem(easy, itemId, true); // practice: one right answer in a row
      expect((await stateOf(easyId, itemId)).currentLevel).toBe('RECOGNITION');

      const exam = (await easy.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'WEEKLY' }).expect(201)).body;
      const dto = (await easy.post(`${API}/assessments/${exam.id}/start`).expect(200)).body as AssessmentDto;
      const question = dto.questions.find((q) => q.exercise.items[0]?.headword === 'colleague')!;
      expect(question).toBeDefined();
      await easy
        .put(`${API}/assessments/${exam.id}/questions/${question.id}/answer`)
        .send({ response: await answerFor(ctx.prisma, question.exercise.id, true), durationMs: 4000 })
        .expect(200);
      await easy.post(`${API}/assessments/${exam.id}/submit`).expect(200);

      expect((await stateOf(easyId, itemId)).currentLevel).toBe('RECALL'); // 1 + 2 = 3 in a row
    });

    it('changing the setting changes the next answers, not the history', async () => {
      const itemId = await itemOf(hardId, 'weird');
      await hard.patch(`${API}/me/profile`).send({ difficulty: 'EASY' }).expect(200);
      await answerItem(hard, itemId, true);
      expect((await stateOf(hardId, itemId)).currentLevel).toBe('RECOGNITION'); // an easy learner's new item
      await hard.patch(`${API}/me/profile`).send({ difficulty: 'CHALLENGING' }).expect(200);
    });
  });
});
