import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  emptyDraftItem,
  type AchievementsDto,
  type AssessmentDto,
  type AssessmentResultDto,
  type AssessmentSummaryDto,
  type DailySessionDto,
  type DashboardDto,
  type DraftItem,
  type Explanation,
  type ParsedMaterial,
  type ProgressDto,
  type SessionResultDto,
} from '@coach/contracts';
import { FakeLlmProvider } from '../src/modules/ai/providers/fake.provider.js';
import { answerFor } from './answers.js';
import { API, createIntegrationApp, hasDatabase, resetDatabase, type TestContext } from './integration.js';

const word = (headword: string, meaningFa: string): DraftItem => ({
  ...emptyDraftItem('VOCABULARY', headword),
  meaningEn: `meaning of ${headword}`,
  meaningFa,
  partOfSpeech: 'noun',
  examples: [`I need the ${headword} today.`],
  confidence: 'medium',
});

const SUGGESTIONS: ParsedMaterial = {
  summary: 'People and jobs.',
  items: [
    word('colleague', 'همکار'),
    word('manager', 'مدیر'),
    word('employee', 'کارمند'),
    word('salary', 'حقوق'),
    word('interview', 'مصاحبه'),
    word('career', 'شغل'),
  ],
  exercises: [],
};

const EXPLANATION: Explanation = {
  overviewFa: 'یعنی همکار.',
  keyPoints: ['اسم قابل شمارش است.'],
  examples: [{ en: 'My colleague helped me.', fa: 'همکارم کمکم کرد.' }],
  commonMistakes: [],
};

/**
 * One learner, from signing up to their first achievements, through the real application and a real
 * database (only the AI is faked). If a change breaks how the parts fit together, this fails first.
 */
describe.skipIf(!hasDatabase())('a learner’s first days, end to end (real PostgreSQL, fake AI)', () => {
  let ctx: TestContext;
  let me: ReturnType<typeof request.agent>;
  let lessonId: string;
  let unitId: string;
  let itemIds: string[] = [];

  beforeAll(async () => {
    const ai = new FakeLlmProvider((req) => (req.schemaName === 'item_explanation' ? EXPLANATION : SUGGESTIONS));
    ctx = await createIntegrationApp({ llm: ai });
    await resetDatabase(ctx);
    me = request.agent(ctx.server);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('signs up, and the app knows what is available', async () => {
    const status = (await request(ctx.server).get(`${API}/system/status`).expect(200)).body;
    expect(status).toMatchObject({ registrationOpen: true });
    const res = await me.post(`${API}/auth/register`).send({ displayName: 'Nila', email: 'nila@example.com', password: 'first week 1', timezone: 'Asia/Tehran' }).expect(201);
    expect(res.body.user.displayName).toBe('Nila');
    expect((await me.get(`${API}/me/profile`).expect(200)).body.difficulty).toBe('CHALLENGING');
  });

  it('adds a book from the list and names its lessons from her copy', async () => {
    const book = (await me.post(`${API}/book-templates/aef-3e-3/add`).expect(201)).body;
    await me.post(`${API}/books/${book.id}/import-structure`).send({ text: 'Unit 1 People\n1A Meeting people\n1B Jobs' }).expect(200);
    const detail = (await me.get(`${API}/books/${book.id}`)).body;
    expect(detail.units[0].title).toBe('People');
    expect(detail.units[0].lessons.map((l: { title: string }) => l.title)).toEqual(['Meeting people', 'Jobs', 'Lesson C']);
    lessonId = detail.units[0].lessons[0].id;
    unitId = detail.units[0].id;
    await me.put(`${API}/me/current-lesson`).send({ lessonId }).expect(200);
  });

  it('has the AI suggest content for the lesson, reviews it and keeps it', async () => {
    const suggestion = (await me.post(`${API}/lessons/${lessonId}/suggest-content`).send({}).expect(200)).body;
    expect(suggestion.itemCount).toBe(6);
    const material = (await me.get(`${API}/teacher-materials/${suggestion.materialId}`).expect(200)).body;
    expect(material.status).toBe('AWAITING_REVIEW');
    const items = material.draft.items.map(({ known: _known, ...rest }: DraftItem & { known: boolean }) => rest);
    const kept = (await me.post(`${API}/teacher-materials/${suggestion.materialId}/commit`).send({ items, exercises: [] }).expect(200)).body;
    expect(kept.created).toBe(6);
    const library = (await me.get(`${API}/items`)).body.items as { id: string; lessons: { id: string }[]; status: string }[];
    itemIds = library.map((i) => i.id);
    expect(itemIds).toHaveLength(6);
    expect(library.every((i) => i.status === 'NEW' && i.lessons[0]!.id === lessonId)).toBe(true);
  });

  it('learns the lesson: the screen has its items, and an item can be explained', async () => {
    const ctxDto = (await me.get(`${API}/learn/context?lessonId=${lessonId}`)).body;
    expect(ctxDto).toMatchObject({ title: '1A · Meeting people', itemCount: 6, needsTopic: false });
    const explained = (await me.post(`${API}/items/${itemIds[0]}/explain`).expect(200)).body;
    expect(explained.explanation.overviewFa).toBe(EXPLANATION.overviewFa);
  });

  it('practises the lesson and the answers teach the system', async () => {
    const run = (await me.post(`${API}/practice`).send({ scope: 'lesson', lessonId, count: 6 }).expect(200)).body;
    expect(run.exercises.length).toBeGreaterThan(2);
    expect(run.exercises.every((e: { format: string }) => e.format !== 'flashcard')).toBe(true); // the default difficulty is challenging
    for (const [i, ex] of run.exercises.slice(0, 4).entries()) {
      const res = await me
        .post(`${API}/attempts`)
        .send({ clientAttemptId: randomUUID(), exerciseId: ex.id, response: await answerFor(ctx.prisma, ex.id, i !== 1), durationMs: 9000 })
        .expect(200);
      expect(res.body.verdict).toBeTruthy();
    }
    expect((await me.get(`${API}/mistakes/summary`)).body.active).toBeGreaterThanOrEqual(1);
    const library = (await me.get(`${API}/items`)).body.items as { status: string }[];
    expect(library.some((i) => i.status !== 'NEW')).toBe(true);
  });

  let session: SessionResultDto;
  it('does the daily session and earns the first achievement', async () => {
    const dto = (await me.post(`${API}/daily-sessions`).send({}).expect(200)).body.session as DailySessionDto;
    expect(dto.exercises.length).toBeGreaterThan(0);
    for (const ex of dto.exercises) {
      await me
        .post(`${API}/attempts`)
        .send({ clientAttemptId: randomUUID(), exerciseId: ex.id, sessionItemId: ex.sessionItemId, response: await answerFor(ctx.prisma, ex.id, true), durationMs: 8000 })
        .expect(200);
    }
    session = (await me.post(`${API}/daily-sessions/${dto.id}/complete`).expect(200)).body;
    expect(session.streak.current).toBe(1);
    expect(session.newAchievements.map((a) => a.code)).toContain('FIRST_SESSION');
  });

  it('takes a quiz and an exam on the unit, with no feedback in the exam until the end', async () => {
    const quiz = (await me.post(`${API}/assessments`).send({ kind: 'QUIZ', preset: 'LESSON', lessonId }).expect(201)).body as AssessmentSummaryDto;
    const quizDto = (await me.post(`${API}/assessments/${quiz.id}/start`).expect(200)).body as AssessmentDto;
    for (const q of quizDto.questions) {
      const saved = (
        await me.put(`${API}/assessments/${quiz.id}/questions/${q.id}/answer`).send({ response: await answerFor(ctx.prisma, q.exercise.id, true), durationMs: 5000 }).expect(200)
      ).body;
      expect(saved.result.verdict).toBe('correct'); // a quiz says so at once
    }
    const quizResult = (await me.post(`${API}/assessments/${quiz.id}/submit`).expect(200)).body as AssessmentResultDto;
    expect(quizResult.score).toBe(1);
    expect(quizResult.newAchievements.map((a) => a.code)).toEqual(expect.arrayContaining(['FIRST_QUIZ']));

    const exam = (await me.post(`${API}/assessments`).send({ kind: 'EXAM', preset: 'UNIT', unitId }).expect(201)).body as AssessmentSummaryDto;
    const examDto = (await me.post(`${API}/assessments/${exam.id}/start`).expect(200)).body as AssessmentDto;
    for (const q of examDto.questions) {
      const saved = (
        await me.put(`${API}/assessments/${exam.id}/questions/${q.id}/answer`).send({ response: await answerFor(ctx.prisma, q.exercise.id, false), durationMs: 5000 }).expect(200)
      ).body;
      expect(saved.result).toBeNull(); // an exam keeps quiet
    }
    const examResult = (await me.post(`${API}/assessments/${exam.id}/submit`).expect(200)).body as AssessmentResultDto;
    expect(examResult.score).toBe(0);
    expect(examResult.review.every((r) => r.verdict === 'wrong')).toBe(true);
  });

  it('then sees all of it in progress, challenges, achievements and the dashboard', async () => {
    // The dashboard goes first: looking at it pays any challenge that is done, which the other numbers must then include.
    const dashboard = (await me.get(`${API}/dashboard`)).body as DashboardDto;
    const progress = (await me.get(`${API}/progress?days=7`)).body as ProgressDto;
    expect(progress.totals.sessions).toBe(1);
    expect(progress.totals.quizzes).toBe(1);
    expect(progress.totals.exams).toBe(1);
    expect(progress.statuses.total).toBe(6);
    expect(progress.books[0]!.units[0]).toMatchObject({ number: 1, items: 6 });

    const achievements = (await me.get(`${API}/achievements`)).body as AchievementsDto;
    const earned = achievements.achievements.filter((a) => a.unlockedAt).map((a) => a.code);
    expect(earned).toEqual(expect.arrayContaining(['FIRST_SESSION', 'FIRST_QUIZ', 'FIRST_EXAM']));

    expect(dashboard.today.session?.status).toBe('COMPLETED');
    expect(dashboard.streak.current).toBe(1);
    expect(dashboard.challenges.daily.kind).toBe('DAILY');
    expect(dashboard.mistakes.active + dashboard.mistakes.improving).toBeGreaterThanOrEqual(1);
    expect(dashboard.xp.total).toBe(progress.level.total);
  });

  it('can raise or lower the difficulty, and keeps it', async () => {
    await me.patch(`${API}/me/profile`).send({ difficulty: 'EASY', dailyGoalMinutes: 15 }).expect(200);
    expect((await me.get(`${API}/me/profile`)).body).toMatchObject({ difficulty: 'EASY', dailyGoalMinutes: 15 });
  });

  it('is invisible to every other learner', async () => {
    const other = request.agent(ctx.server);
    await other.post(`${API}/auth/register`).send({ displayName: 'Other', email: 'other@example.com', password: 'someone else 2' }).expect(201);
    expect((await other.get(`${API}/books`)).body).toEqual([]);
    expect((await other.get(`${API}/items`)).body.items).toEqual([]);
    expect((await other.get(`${API}/progress`)).body.totals.attempts).toBe(0);
    expect((await other.get(`${API}/achievements`)).body.unlocked).toBe(0);
    await other.get(`${API}/learn/context?lessonId=${lessonId}`).expect(404);
    await other.get(`${API}/items/${itemIds[0]}/explanation`).expect(404);
  });

  it('signs out and is then locked out', async () => {
    await me.post(`${API}/auth/logout`).expect(204);
    await me.get(`${API}/dashboard`).expect(401);
  });
});
