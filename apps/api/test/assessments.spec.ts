import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssessmentDto, AssessmentResultDto, AssessmentSummaryDto } from '@coach/contracts';
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

describe.skipIf(!hasDatabase())('quizzes and exams (real PostgreSQL)', () => {
  let ctx: TestContext;
  let alice: Agent;
  let bob: Agent;
  let carol: Agent;
  let aliceId: string;
  let lessonId: string;

  const create = (agent: Agent, kind: string, preset: string) => agent.post(`${API}/assessments`).send({ kind, preset });
  const start = async (agent: Agent, id: string) => (await agent.post(`${API}/assessments/${id}/start`).expect(200)).body as AssessmentDto;
  const answerQ = (agent: Agent, id: string, qid: string, response: unknown, durationMs = 6000) =>
    agent.put(`${API}/assessments/${id}/questions/${qid}/answer`).send({ response, durationMs });
  const exerciseOf = async (qid: string) => (await ctx.prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: qid } })).exerciseId;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
    await resetDatabase(ctx);
    alice = await signedInAgent(ctx, 'alice@example.com');
    bob = await signedInAgent(ctx, 'bob@example.com');
    carol = await signedInAgent(ctx, 'carol@example.com');
    aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } })).id;

    const book = (await alice.post(`${API}/books`).send({ title: 'American English File 3' }).expect(201)).body;
    await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '8B Business' }).expect(200);
    lessonId = (await alice.get(`${API}/books/${book.id}`)).body.units[0].lessons[0].id;
    await alice.put(`${API}/me/current-lesson`).send({ lessonId }).expect(200);

    const words: [string, string][] = [
      ['negotiate', 'مذاکره کردن'],
      ['strictly', 'به‌طور سخت‌گیرانه'],
      ['weird', 'عجیب'],
      ['static', 'ثابت'],
      ['deadline', 'مهلت'],
      ['colleague', 'همکار'],
      ['invoice', 'فاکتور'],
      ['budget', 'بودجه'],
    ];
    for (const [headword, meaningFa] of words) {
      await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword, meaningFa, lessonIds: [lessonId] }).expect(201);
    }
    await alice
      .post(`${API}/items`)
      .send({ type: 'IRREGULAR_VERB', headword: 'wear', meaningFa: 'پوشیدن', lessonIds: [lessonId], payload: { base: 'wear', past: 'wore', pastParticiple: 'worn' } })
      .expect(201);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('creating', () => {
    it('chooses and locks the questions, and sends none of the answers', async () => {
      const res = await create(alice, 'QUIZ', 'LESSON').expect(201);
      const summary = res.body as AssessmentSummaryDto;
      expect(summary).toMatchObject({ kind: 'QUIZ', preset: 'LESSON', status: 'READY', score: null, xpEarned: 0 });
      expect(summary.questionCount).toBeGreaterThanOrEqual(3);
      expect(summary.title).toContain('8B');

      const dto = (await alice.get(`${API}/assessments/${summary.id}`).expect(200)).body as AssessmentDto;
      expect(dto).toMatchObject({ status: 'READY', feedback: 'IMMEDIATE', startedAt: null, expiresAt: null });
      expect(dto.questions).toHaveLength(summary.questionCount);
      expect(dto.questions.map((q) => q.position)).toEqual(dto.questions.map((_, i) => i + 1));
      expect(JSON.stringify(dto)).not.toMatch(/solution|acceptedAnswers|correctOptionId/);
    });

    it('never asks the same question twice, nor one that needs the AI', async () => {
      const summary = (await create(alice, 'EXAM', 'LESSON').expect(201)).body as AssessmentSummaryDto;
      const dto = (await alice.get(`${API}/assessments/${summary.id}`)).body as AssessmentDto;
      const ids = dto.questions.map((q) => q.exercise.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(dto.questions.every((q) => q.exercise.format !== 'free_production')).toBe(true);
      expect(dto.feedback).toBe('END');
    });

    it('refuses what makes no sense', async () => {
      await create(alice, 'QUIZ', 'MONTHLY').expect(400); // not a quiz preset
      await create(alice, 'QUIZ', 'NOPE').expect(400);
      await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', extra: 1 }).expect(400);
    });

    it('needs a current lesson, and enough content to ask about', async () => {
      await create(carol, 'QUIZ', 'LESSON').expect(409); // no lesson chosen
      await carol.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'solo', meaningFa: 'تنها' }).expect(201);
      const res = await create(carol, 'QUIZ', 'WEEKLY').expect(409); // nothing practised
      expect(res.body.code).toBe('CONFLICT');
    });
  });

  describe('a quiz', () => {
    let quiz: AssessmentDto;
    let first: AssessmentDto['questions'][number];

    beforeAll(async () => {
      const id = ((await create(alice, 'QUIZ', 'LESSON').expect(201)).body as AssessmentSummaryDto).id;
      await alice.get(`${API}/assessments/${id}`);
      quiz = await start(alice, id);
      first = quiz.questions[0]!;
    });

    it('cannot be answered before it is started', async () => {
      const id = ((await create(alice, 'QUIZ', 'LESSON').expect(201)).body as AssessmentSummaryDto).id;
      const q = ((await alice.get(`${API}/assessments/${id}`)).body as AssessmentDto).questions[0]!;
      await answerQ(alice, id, q.id, await answerFor(ctx.prisma, q.exercise.id, true)).expect(409);
    });

    it('starts the clock once: starting again keeps the same deadline', async () => {
      expect(quiz.status).toBe('IN_PROGRESS');
      expect(quiz.startedAt).not.toBeNull();
      const limit = quiz.timeLimitSec!;
      const deadline = new Date(quiz.expiresAt!).getTime() - new Date(quiz.startedAt!).getTime();
      expect(deadline).toBe((limit + 30) * 1000);

      const again = await start(alice, quiz.id);
      expect(again.expiresAt).toBe(quiz.expiresAt);
    });

    it('checks each answer at once and counts it as a quiz answer, with no XP of its own', async () => {
      const res = await answerQ(alice, quiz.id, first.id, await answerFor(ctx.prisma, first.exercise.id, true)).expect(200);
      expect(res.body.saved).toBe(true);
      expect(res.body.result).toMatchObject({ verdict: 'correct', xp: 0 });

      const attempt = await ctx.prisma.exerciseAttempt.findUniqueOrThrow({ where: { id: first.id } });
      expect(attempt).toMatchObject({ context: 'QUIZ', assessmentQuestionId: first.id });

      // It taught the system something, like any other answer.
      const itemId = first.exercise.items[0]!.id;
      const state = await ctx.prisma.userItemState.findUniqueOrThrow({ where: { userId_itemId: { userId: aliceId, itemId } } });
      expect(state.reps).toBe(1);
    });

    it('answering the same question again returns the first result and records nothing new', async () => {
      const before = await ctx.prisma.exerciseAttempt.count({ where: { userId: aliceId, context: 'QUIZ' } });
      const res = await answerQ(alice, quiz.id, first.id, await answerFor(ctx.prisma, first.exercise.id, false)).expect(200);
      expect(res.body.result.verdict).toBe('correct');
      expect(await ctx.prisma.exerciseAttempt.count({ where: { userId: aliceId, context: 'QUIZ' } })).toBe(before);
    });

    it('rejects an answer in the wrong shape', async () => {
      const q = quiz.questions[1]!;
      const res = await answerQ(alice, quiz.id, q.id, { nonsense: true }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('keeps one learner out of another learner’s quiz', async () => {
      await bob.get(`${API}/assessments/${quiz.id}`).expect(404);
      await bob.post(`${API}/assessments/${quiz.id}/start`).expect(404);
      await answerQ(bob, quiz.id, first.id, { optionId: 'a' }).expect(404);
      await bob.post(`${API}/assessments/${quiz.id}/submit`).expect(404);
      await bob.get(`${API}/assessments/${quiz.id}/result`).expect(404);
    });

    it('has no result until it is handed in', async () => {
      await alice.get(`${API}/assessments/${quiz.id}/result`).expect(409);
    });

    it('is scored on every question, pays XP from the score, and is safe to hand in twice', async () => {
      // Answer one more wrongly, leave the rest unanswered.
      const second = quiz.questions[1]!;
      await answerQ(alice, quiz.id, second.id, await answerFor(ctx.prisma, second.exercise.id, false)).expect(200);

      const res = await alice.post(`${API}/assessments/${quiz.id}/submit`).expect(200);
      const result = res.body as AssessmentResultDto;
      const total = quiz.questions.length;
      expect(result).toMatchObject({ kind: 'QUIZ', total, correct: 1, wrong: 1, unanswered: total - 2 });
      expect(result.score).toBeCloseTo(1 / total);
      expect(result.xpEarned).toBe(Math.round((1 / total) * 50));
      expect(result.breakdown[0]).toMatchObject({ skill: expect.any(String), label: expect.any(String) });
      expect(result.newMistakes).toBeGreaterThanOrEqual(1);
      expect(result.review).toHaveLength(total);

      const reviewed = result.review.find((r) => r.position === second.position)!;
      expect(reviewed).toMatchObject({ answered: true, verdict: 'wrong' });
      // A flashcard has no written answer to show; everything else says what was expected.
      if (second.exercise.format !== 'flashcard') expect(reviewed.correctAnswerText).toBeTruthy();
      const right = result.review.find((r) => r.position === first.position)!;
      expect(right.correctAnswerText).toBeNull(); // a right answer needs no correction
      expect(result.review.find((r) => !r.answered)).toMatchObject({ verdict: null, yourAnswer: null });

      const again = await alice.post(`${API}/assessments/${quiz.id}/submit`).expect(200);
      expect(again.body.xpEarned).toBe(result.xpEarned);
      expect(await ctx.prisma.xpEvent.count({ where: { userId: aliceId, reason: 'QUIZ', refId: quiz.id } })).toBe(1);
      expect((await alice.get(`${API}/assessments/${quiz.id}/result`).expect(200)).body.score).toBeCloseTo(result.score);

      // Once graded, the take-screen has no questions left to show and no more answers are taken.
      const dto = (await alice.get(`${API}/assessments/${quiz.id}`)).body as AssessmentDto;
      expect(dto).toMatchObject({ status: 'GRADED', questions: [] });
      await answerQ(alice, quiz.id, quiz.questions[2]!.id, { optionId: 'a' }).expect(409);
    });
  });

  describe('an exam', () => {
    let exam: AssessmentDto;

    beforeAll(async () => {
      const id = ((await create(alice, 'EXAM', 'UNIT').expect(201)).body as AssessmentSummaryDto).id;
      exam = await start(alice, id);
    });

    it('keeps answers without saying whether they are right, and lets them be changed', async () => {
      const q = exam.questions[0]!;
      const wrong = await answerFor(ctx.prisma, q.exercise.id, false);
      const res = await answerQ(alice, exam.id, q.id, wrong).expect(200);
      expect(res.body).toEqual({ saved: true, result: null });

      const stored = await ctx.prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: q.id } });
      expect(stored.response).toEqual(wrong);
      expect(await ctx.prisma.exerciseAttempt.count({ where: { assessmentQuestionId: q.id } })).toBe(0);

      // Changed their mind.
      const right = await answerFor(ctx.prisma, q.exercise.id, true);
      await answerQ(alice, exam.id, q.id, right).expect(200);
      expect((await ctx.prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: q.id } })).response).toEqual(right);

      const dto = (await alice.get(`${API}/assessments/${exam.id}`)).body as AssessmentDto;
      expect(dto.questions[0]!.answered).toBe(true);
      expect(dto.questions[1]!.answered).toBe(false);
    });

    it('is marked all at once when handed in, at the weight of an exam', async () => {
      // Question 1 stays right; question 2 is wrong; question 3 is right; the rest are left.
      const [, q2, q3] = exam.questions;
      await answerQ(alice, exam.id, q2!.id, await answerFor(ctx.prisma, q2!.exercise.id, false)).expect(200);
      await answerQ(alice, exam.id, q3!.id, await answerFor(ctx.prisma, q3!.exercise.id, true)).expect(200);

      const result = (await alice.post(`${API}/assessments/${exam.id}/submit`).expect(200)).body as AssessmentResultDto;
      const total = exam.questions.length;
      expect(result).toMatchObject({ kind: 'EXAM', total, correct: 2, wrong: 1, unanswered: total - 3 });
      expect(result.xpEarned).toBe(Math.round((2 / total) * 100));

      const attempts = await ctx.prisma.exerciseAttempt.findMany({ where: { assessmentQuestion: { assessmentId: exam.id } } });
      expect(attempts).toHaveLength(3);
      expect(attempts.every((a) => a.context === 'EXAM')).toBe(true);
      // Each answer was recorded under its question's id, and earned nothing by itself.
      expect(attempts.every((a) => (a.evaluation as { xp: number }).xp === 0)).toBe(true);

      // The review shows the correction for the wrong one only.
      const wrongRow = result.review.find((r) => r.position === q2!.position)!;
      if (q2!.exercise.format !== 'flashcard') expect(wrongRow.correctAnswerText).toBeTruthy();
      expect(result.review.find((r) => r.position === exam.questions[0]!.position)!.correctAnswerText).toBeNull();
    });

    it('feeds the mistake bank and the review schedule like practice does', async () => {
      const q2 = exam.questions[1]!;
      const itemId = q2.exercise.items[0]!.id;
      const mistakes = await ctx.prisma.mistake.findMany({ where: { userId: aliceId, itemId, status: { in: ['ACTIVE', 'IMPROVING'] } } });
      expect(mistakes.length).toBeGreaterThanOrEqual(1);
      expect(await ctx.prisma.reviewLog.count({ where: { userId: aliceId, itemId } })).toBeGreaterThanOrEqual(1);
    });

    it('is safe to hand in twice', async () => {
      const before = await ctx.prisma.exerciseAttempt.count({ where: { userId: aliceId, context: 'EXAM' } });
      const again = await alice.post(`${API}/assessments/${exam.id}/submit`).expect(200);
      expect(again.body.correct).toBe(2);
      expect(await ctx.prisma.exerciseAttempt.count({ where: { userId: aliceId, context: 'EXAM' } })).toBe(before);
      expect(await ctx.prisma.xpEvent.count({ where: { userId: aliceId, reason: 'EXAM', refId: exam.id } })).toBe(1);
    });
  });

  describe('time', () => {
    it('stops taking answers when time is up, and hands in what was saved', async () => {
      const id = ((await create(alice, 'EXAM', 'LESSON').expect(201)).body as AssessmentSummaryDto).id;
      const dto = await start(alice, id);
      const q = dto.questions[0]!;
      await answerQ(alice, id, q.id, await answerFor(ctx.prisma, q.exercise.id, true)).expect(200);

      // The clock ran out (including the grace period).
      await ctx.prisma.assessment.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const late = await answerQ(alice, id, dto.questions[1]!.id, await answerFor(ctx.prisma, dto.questions[1]!.exercise.id, true)).expect(409);
      expect(late.body.detail).toMatch(/Time is up/);

      const result = (await alice.get(`${API}/assessments/${id}/result`).expect(200)).body as AssessmentResultDto;
      expect(result).toMatchObject({ correct: 1, unanswered: dto.questions.length - 1 });
      expect((await ctx.prisma.assessment.findUniqueOrThrow({ where: { id } })).status).toBe('GRADED');
    });

    it('grades an abandoned one when someone looks at it after the deadline', async () => {
      const id = ((await create(alice, 'QUIZ', 'LESSON').expect(201)).body as AssessmentSummaryDto).id;
      await start(alice, id);
      await ctx.prisma.assessment.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const dto = (await alice.get(`${API}/assessments/${id}`).expect(200)).body as AssessmentDto;
      expect(dto.status).toBe('GRADED');
      expect((await alice.get(`${API}/assessments/${id}/result`).expect(200)).body.score).toBe(0);
    });
  });

  describe('topic exams', () => {
    const headwordsOf = async (id: string) => {
      const dto = (await alice.get(`${API}/assessments/${id}`)).body as AssessmentDto;
      return new Set(dto.questions.flatMap((q) => q.exercise.items.map((i) => i.headword)));
    };

    it('a vocabulary exam covers words from every book and leaves grammar and verbs out', async () => {
      const res = await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'VOCABULARY' }).expect(201);
      expect(res.body.title).toBe('Exam · All vocabulary');
      const words = await headwordsOf(res.body.id);
      expect(words.size).toBeGreaterThanOrEqual(3);
      expect(words.has('wear')).toBe(false); // an irregular verb is grammar
    });

    it('a grammar exam covers grammar-like items only, or says there is not enough', async () => {
      const res = await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'GRAMMAR' });
      if (res.status === 201) {
        const words = await headwordsOf(res.body.id);
        expect([...words].every((w) => w === 'wear')).toBe(true);
      } else {
        expect(res.status).toBe(409);
      }
    });

    it('are exams only, and say so when the learner has nothing of that kind', async () => {
      await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'VOCABULARY' }).expect(400);
      const res = await carol.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'GRAMMAR' }).expect(409);
      expect(res.body.detail).toMatch(/no grammar/i);
    });
  });

  describe('a boss quiz', () => {
    let unitId: string;

    beforeAll(async () => {
      unitId = (await alice.get(`${API}/learn/context?lessonId=${lessonId}`)).body.unitId;
    });

    it('belongs to a unit, and is a kind of exam', async () => {
      await create(alice, 'EXAM', 'BOSS').expect(400); // no unit named
      await alice.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'BOSS', unitId }).expect(400); // not a quiz
      await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId, lessonId }).expect(400);
      const res = await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId }).expect(201);
      expect(res.body).toMatchObject({ kind: 'EXAM', preset: 'BOSS' });
      expect(res.body.title).toMatch(/^Boss quiz · Unit /);
      expect(res.body.questionCount).toBeGreaterThanOrEqual(8);
    });

    it('pays a bonus on top of the exam XP for beating it, and unlocks the achievement', async () => {
      const summary = (await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId }).expect(201)).body as AssessmentSummaryDto;
      const dto = await start(alice, summary.id);
      for (const q of dto.questions) await answerQ(alice, summary.id, q.id, await answerFor(ctx.prisma, q.exercise.id, true)).expect(200);

      const result = (await alice.post(`${API}/assessments/${summary.id}/submit`).expect(200)).body as AssessmentResultDto;
      expect(result.score).toBe(1);
      expect(result.boss).toEqual({ won: true, bonusXp: 50 });
      expect(result.xpEarned).toBeGreaterThanOrEqual(150); // 100 for a perfect exam + 50 for the boss (+ a goal bonus the first time)
      expect(result.newAchievements.map((a) => a.code)).toContain('BOSS_SLAYER');
    });

    it('pays no bonus when it is not beaten', async () => {
      const summary = (await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId }).expect(201)).body as AssessmentSummaryDto;
      const dto = await start(alice, summary.id);
      for (const q of dto.questions.slice(0, 3)) await answerQ(alice, summary.id, q.id, await answerFor(ctx.prisma, q.exercise.id, true)).expect(200);
      const result = (await alice.post(`${API}/assessments/${summary.id}/submit`).expect(200)).body as AssessmentResultDto;
      expect(result.boss).toEqual({ won: false, bonusXp: 0 });
      expect(result.xpEarned).toBe(Math.round(result.score * 100));
    });

    it('does not show up as a plain exam preset, and other exams carry no boss result', async () => {
      const exam = (await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'LESSON', lessonId }).expect(201)).body as AssessmentSummaryDto;
      await start(alice, exam.id);
      const result = (await alice.post(`${API}/assessments/${exam.id}/submit`).expect(200)).body as AssessmentResultDto;
      expect(result.boss).toBeNull();
    });

    it('needs enough questions to be a boss', async () => {
      const book = (await alice.post(`${API}/books`).send({ title: 'Tiny' }).expect(201)).body;
      await alice.post(`${API}/books/${book.id}/import-structure`).send({ text: '1A One' }).expect(200);
      const tiny = (await alice.get(`${API}/books/${book.id}`)).body.units[0];
      await alice.post(`${API}/items`).send({ type: 'VOCABULARY', headword: 'only', meaningFa: 'فقط', lessonIds: [tiny.lessons[0].id] }).expect(201);
      const res = await alice.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId: tiny.id }).expect(409);
      expect(res.body.detail).toMatch(/at least 8 questions/);
    });

    it('is not offered to another learner’s unit', async () => {
      await bob.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'BOSS', unitId }).expect(404);
    });
  });

  describe('listing and recommendations', () => {
    it('lists the learner’s own, newest first, and nobody else’s', async () => {
      const mine = (await alice.get(`${API}/assessments`).expect(200)).body;
      expect(mine.assessments.length).toBeGreaterThanOrEqual(5);
      const times = mine.assessments.map((a: AssessmentSummaryDto) => new Date(a.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      const theirs = (await bob.get(`${API}/assessments`).expect(200)).body;
      expect(theirs.assessments).toEqual([]);
      expect(theirs.recommendations).toEqual({ quiz: null, exam: null });
    });

    it('suggests an exam when the unit has settled, and a quiz when the lesson was seen but not quizzed this week', async () => {
      const before = (await alice.get(`${API}/assessments`)).body.recommendations;
      // Alice has taken a quiz just now, so no quiz suggestion yet.
      expect(before.quiz).toBeNull();

      await ctx.prisma.assessment.deleteMany({ where: { userId: aliceId, kind: 'QUIZ' } });
      const items = await ctx.prisma.learningItem.findMany({ where: { ownerId: aliceId }, select: { id: true } });
      for (const { id: itemId } of items) {
        await ctx.prisma.userItemState.upsert({
          where: { userId_itemId: { userId: aliceId, itemId } },
          create: { userId: aliceId, itemId, status: 'REVIEW' },
          update: { status: 'REVIEW' },
        });
      }
      const after = (await alice.get(`${API}/assessments`)).body.recommendations;
      expect(after.quiz).toMatchObject({ preset: 'LESSON' });
      expect(after.exam).toMatchObject({ preset: 'UNIT' });
    });
  });
});
