import { Injectable } from '@nestjs/common';
import {
  ERROR_TYPES,
  PRESET_LABELS,
  RESPONSE_SCHEMAS,
  type AnswerAssessment,
  type AnswerSavedDto,
  type AssessmentDto,
  type AssessmentKind,
  type AssessmentListDto,
  type AssessmentPreset,
  type AssessmentRecommendation,
  type AssessmentResultDto,
  type AssessmentSummaryDto,
  type CreateAssessment,
  type ErrorTypeCode,
  type ExerciseFormat,
  type ExerciseLevel,
  type ItemType,
  type ReviewQuestionDto,
  type SkillArea,
} from '@coach/contracts';
import {
  ASSESSMENT_DEFAULTS,
  GRACE_SECONDS,
  MIN_QUESTIONS,
  describeResponse,
  gradeAssessment,
  pickQuestions,
  shouldRecommendExam,
  shouldRecommendQuiz,
  toLocalDate,
  weakestSkill,
  xpForAssessment,
  type AssessmentItem,
  type MarkedQuestion,
} from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AttemptsService } from '../exercises/attempts.service.js';
import { ExercisesService, itemSelect, toClient, toInput, withItems } from '../exercises/exercises.service.js';
import { LearningService } from '../learning/learning.service.js';
import { ProgressService } from '../progress/progress.service.js';

const DAY_MS = 86_400_000;
const RECENT_LIST = 30;

const SKILL_LABELS: Partial<Record<SkillArea, string>> = {
  VOCABULARY: 'Vocabulary',
  GRAMMAR: 'Grammar',
  COLLOCATION: 'Collocations',
  WORD_FORMATION: 'Word formation',
  EXPRESSION: 'Expressions',
};

/** The item type to practise for a skill that went badly. */
const SKILL_TO_TYPE: Partial<Record<SkillArea, ItemType>> = {
  VOCABULARY: 'VOCABULARY',
  GRAMMAR: 'GRAMMAR',
  COLLOCATION: 'COLLOCATION',
  WORD_FORMATION: 'WORD_FORMATION',
  EXPRESSION: 'EXPRESSION',
};

const questionInclude = {
  orderBy: { position: 'asc' },
  include: { exercise: { include: withItems }, attempt: true },
} satisfies Prisma.Assessment$questionsArgs;

type AssessmentRow = Prisma.AssessmentGetPayload<{ include: { questions: typeof questionInclude } }>;

const skillLabel = (skill: string) => SKILL_LABELS[skill as SkillArea] ?? skill.charAt(0) + skill.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * Quizzes and exams (TECHNICAL_PLAN §13-14).
 *
 * The questions are chosen and locked when the assessment is created. The server keeps the clock.
 * A quiz checks each answer at once; an exam keeps the answers and checks them all when it is
 * handed in. Either way every answer goes through the same pipeline as practice, so schedules,
 * mastery and mistakes all learn from it.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
    private readonly attempts: AttemptsService,
    private readonly learning: LearningService,
    private readonly progress: ProgressService,
  ) {}

  // ───────────── Create and list ─────────────

  async create(userId: string, request: CreateAssessment): Promise<AssessmentSummaryDto> {
    const defaults = ASSESSMENT_DEFAULTS[request.kind][request.preset];
    if (!defaults) throw new DomainError('VALIDATION_FAILED', 400, 'This preset is not available for this kind.');

    const now = new Date();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const scope = await this.resolveScope(userId, request, now);
    const candidates = await this.prisma.learningItem.findMany({ where: scope.where, select: itemSelect, take: 300 });
    if (candidates.length === 0) {
      throw new DomainError('CONFLICT', 409, scope.empty);
    }

    await this.exercises.ensureTemplatesFor(userId, candidates.map(toInput));
    const ids = candidates.map((c) => c.id);
    const rules = await this.learning.difficultyFor(userId);
    const [pool, context, recent] = await Promise.all([
      this.exercises.poolFor(userId, ids),
      this.learning.contextFor(userId, ids, now, toLocalDate(now, user.timezone)),
      this.exercises.recentExerciseIds(userId),
    ]);
    const poolIds = [...pool.values()].flatMap((list) => list.map((e) => e.id));
    const answered = new Set(
      (
        await this.prisma.exerciseAttempt.findMany({
          where: { userId, exerciseId: { in: poolIds } },
          select: { exerciseId: true },
          distinct: ['exerciseId'],
        })
      ).map((a) => a.exerciseId),
    );

    const items: AssessmentItem[] = candidates.map((c) => {
      const ctx = context.get(c.id)!;
      return {
        id: c.id,
        needsWork: Boolean(ctx.state?.isWeak) || ctx.state?.status === 'LEARNING' || ctx.mistakePriority > 0,
        level: (ctx.state?.currentLevel ?? rules.startLevel) as ExerciseLevel,
        pool: (pool.get(c.id) ?? []).map((e) => ({
          id: e.id,
          level: e.level as ExerciseLevel,
          format: e.format as ExerciseFormat,
          skill: e.skill as SkillArea,
          answeredBefore: answered.has(e.id),
        })),
      };
    });

    const picked = pickQuestions({ kind: request.kind, items, count: defaults.questions, recentlyAnswered: recent });
    if (picked.length < MIN_QUESTIONS) {
      throw new DomainError('CONFLICT', 409, `There is not enough to ask yet. Add a few more items to ${scope.label.toLowerCase()} first.`);
    }

    // A shorter assessment gets proportionally less time, but never less than three minutes.
    const timeLimitSec = Math.max(180, Math.round((defaults.minutes * 60 * picked.length) / defaults.questions));
    const row = await this.prisma.assessment.create({
      data: {
        userId,
        kind: request.kind,
        preset: request.preset,
        title: `${request.kind === 'QUIZ' ? 'Quiz' : 'Exam'} · ${scope.label}`,
        timeLimitSec,
        questions: {
          create: picked.map((e, i) => ({ position: i + 1, exerciseId: e.id, skill: e.skill })),
        },
      },
      include: { _count: { select: { questions: true } } },
    });
    return toSummary(row, row._count.questions);
  }

  async list(userId: string): Promise<AssessmentListDto> {
    const rows = await this.prisma.assessment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIST,
      include: { _count: { select: { questions: true } } },
    });
    return {
      assessments: rows.map((r) => toSummary(r, r._count.questions)),
      recommendations: await this.recommend(userId, rows),
    };
  }

  // ───────────── Take ─────────────

  async get(userId: string, id: string): Promise<AssessmentDto> {
    return this.toDto(await this.settle(userId, await this.load(userId, id)));
  }

  /** Starts the clock. Starting twice changes nothing, so a reload keeps the same deadline. */
  async start(userId: string, id: string): Promise<AssessmentDto> {
    let row = await this.settle(userId, await this.load(userId, id));
    if (row.status === 'READY') {
      const now = new Date();
      const limit = row.timeLimitSec ?? 0;
      await this.prisma.assessment.updateMany({
        where: { id, userId, status: 'READY' },
        data: { status: 'IN_PROGRESS', startedAt: now, expiresAt: new Date(now.getTime() + (limit + GRACE_SECONDS) * 1000) },
      });
      row = await this.load(userId, id);
    }
    return this.toDto(row);
  }

  async answer(userId: string, id: string, questionId: string, body: AnswerAssessment): Promise<AnswerSavedDto> {
    const row = await this.load(userId, id);
    if (row.status === 'GRADED') throw new DomainError('CONFLICT', 409, 'This is already finished.');
    if (row.status === 'READY') throw new DomainError('CONFLICT', 409, 'Start it first.');
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.grade(userId, row);
      throw new DomainError('CONFLICT', 409, 'Time is up. Your answers so far were handed in.');
    }

    const question = row.questions.find((q) => q.id === questionId);
    if (!question) throw notFound('Question not found.');
    const format = question.exercise.format as ExerciseFormat;
    const parsed = RESPONSE_SCHEMAS[format].safeParse(body.response);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 400, 'That answer is not in the right shape.', [
        { path: 'response', message: parsed.error.issues[0]?.message ?? 'Invalid answer.' },
      ]);
    }

    if (row.kind === 'QUIZ') {
      const result = await this.attempts.submit(
        userId,
        { clientAttemptId: question.id, exerciseId: question.exerciseId, response: parsed.data, durationMs: body.durationMs, hintsUsed: 0 },
        { questionId: question.id, kind: 'QUIZ' },
      );
      await this.prisma.assessmentQuestion.update({
        where: { id: question.id },
        data: { answeredAt: new Date(), durationMs: body.durationMs },
      });
      return { saved: true, result };
    }

    // Exam: keep the answer (the learner may change it) and say nothing about it.
    await this.prisma.assessmentQuestion.update({
      where: { id: question.id },
      data: { response: parsed.data as Prisma.InputJsonValue, durationMs: body.durationMs, answeredAt: new Date() },
    });
    return { saved: true, result: null };
  }

  // ───────────── Hand in and result ─────────────

  /** Hands in what has been answered. Safe to call twice. */
  async submit(userId: string, id: string): Promise<AssessmentResultDto> {
    const row = await this.load(userId, id);
    if (row.status === 'READY') throw new DomainError('CONFLICT', 409, 'Start it first.');
    return row.status === 'GRADED' ? this.toResult(row) : this.grade(userId, row);
  }

  async result(userId: string, id: string): Promise<AssessmentResultDto> {
    const row = await this.settle(userId, await this.load(userId, id));
    if (row.status !== 'GRADED') throw new DomainError('CONFLICT', 409, 'This has not been handed in yet.');
    return this.toResult(row);
  }

  // ───────────── Internals ─────────────

  private async load(userId: string, id: string): Promise<AssessmentRow> {
    const row = await this.prisma.assessment.findFirst({ where: { id, userId }, include: { questions: questionInclude } });
    if (!row) throw notFound('Quiz or exam not found.');
    return row;
  }

  /** An assessment whose time ran out is handed in as it stands, whoever notices first. */
  private async settle(userId: string, row: AssessmentRow): Promise<AssessmentRow> {
    if (row.status === 'IN_PROGRESS' && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.grade(userId, row);
      return this.load(userId, row.id);
    }
    return row;
  }

  /**
   * Checks every saved answer (an exam keeps them until now), scores the assessment, awards XP and
   * locks it. Each answer is recorded under the question's own id, so doing this twice records nothing new.
   */
  private async grade(userId: string, row: AssessmentRow): Promise<AssessmentResultDto> {
    if (row.kind === 'EXAM') {
      for (const q of row.questions) {
        if (q.response === null || q.attempt) continue;
        try {
          await this.attempts.submit(
            userId,
            { clientAttemptId: q.id, exerciseId: q.exerciseId, response: q.response, durationMs: q.durationMs ?? undefined, hintsUsed: 0 },
            { questionId: q.id, kind: 'EXAM' },
          );
        } catch (error) {
          // A question whose exercise was removed meanwhile cannot be marked: it counts as unanswered.
          if (!(error instanceof DomainError && error.getStatus() === 404)) throw error;
        }
      }
    }

    const fresh = await this.load(userId, row.id);
    const marked = fresh.questions.map(markOf);
    const grade = gradeAssessment(marked);
    const xp = xpForAssessment(fresh.kind as AssessmentKind, grade.score);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Whoever gets here first grades it; a concurrent second request just reads the result.
      const claimed = await tx.assessment.updateMany({
        where: { id: fresh.id, status: { not: 'GRADED' } },
        data: { status: 'GRADED', gradedAt: now, score: grade.score, breakdown: grade.breakdown as unknown as Prisma.InputJsonValue },
      });
      if (claimed.count === 0) return;
      const paid = await this.progress.recordAssessment(tx, {
        userId,
        localDate: toLocalDate(now, user.timezone),
        assessmentId: fresh.id,
        kind: fresh.kind as 'QUIZ' | 'EXAM',
        xp,
      });
      await tx.assessment.update({ where: { id: fresh.id }, data: { xpEarned: paid } });
    });

    return this.toResult(await this.load(userId, fresh.id));
  }

  private toDto(row: AssessmentRow): AssessmentDto {
    const graded = row.status === 'GRADED';
    return {
      id: row.id,
      kind: row.kind,
      preset: row.preset,
      title: row.title,
      status: row.status,
      feedback: row.kind === 'QUIZ' ? 'IMMEDIATE' : 'END',
      timeLimitSec: row.timeLimitSec,
      startedAt: row.startedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      questions: graded
        ? []
        : row.questions.map((q) => ({
            id: q.id,
            position: q.position,
            exercise: toClient(q.exercise),
            answered: row.kind === 'QUIZ' ? q.attempt !== null : q.response !== null,
          })),
    };
  }

  private async toResult(row: AssessmentRow): Promise<AssessmentResultDto> {
    const grade = gradeAssessment(row.questions.map(markOf));
    const attemptIds = row.questions.flatMap((q) => (q.attempt ? [q.attempt.id] : []));
    const newMistakes =
      attemptIds.length === 0
        ? 0
        : (
            await this.prisma.mistakeOccurrence.findMany({
              where: { attemptId: { in: attemptIds } },
              select: { mistakeId: true },
              distinct: ['mistakeId'],
            })
          ).length;

    const review: ReviewQuestionDto[] = row.questions.map((q) => {
      const attempt = q.attempt;
      const evaluation = (attempt?.evaluation ?? {}) as { correctAnswerText?: string | null; explanationFa?: string | null; errorCodes?: string[] };
      const verdict = attempt ? (attempt.verdict as ReviewQuestionDto['verdict']) : null;
      return {
        position: q.position,
        exercise: toClient(q.exercise),
        answered: attempt !== null,
        verdict,
        yourAnswer: attempt ? describeResponse(q.exercise.format as ExerciseFormat, q.exercise.content, attempt.response) || null : null,
        correctAnswerText: verdict && verdict !== 'correct' ? (evaluation.correctAnswerText ?? null) : null,
        explanationFa: verdict && verdict !== 'correct' ? (evaluation.explanationFa ?? null) : null,
        errorLabels:
          verdict && verdict !== 'correct'
            ? (evaluation.errorCodes ?? []).filter((c) => c !== 'OTHER.OTHER').map((c) => ERROR_TYPES[c as ErrorTypeCode]?.labelEn ?? c)
            : [],
      };
    });

    const weak = weakestSkill(grade.breakdown);
    const type = weak ? SKILL_TO_TYPE[weak.skill] : undefined;
    const started = row.startedAt?.getTime() ?? row.createdAt.getTime();
    const ended = row.gradedAt?.getTime() ?? Date.now();
    const limit = (row.timeLimitSec ?? 0) + GRACE_SECONDS;

    return {
      id: row.id,
      kind: row.kind,
      preset: row.preset,
      title: row.title,
      score: row.score ?? grade.score,
      total: grade.total,
      correct: grade.correct,
      almost: grade.almost,
      wrong: grade.wrong,
      unanswered: grade.unanswered,
      xpEarned: row.xpEarned,
      durationSec: Math.min(Math.round((ended - started) / 1000), limit),
      breakdown: grade.breakdown.map((b) => ({ ...b, label: skillLabel(b.skill) })),
      newMistakes,
      suggestion: weak
        ? {
            label: `Practice ${skillLabel(weak.skill).toLowerCase()}`,
            href: type ? `/practice/play?scope=type&type=${type}&count=10` : '/practice/play?scope=weak&count=10',
          }
        : null,
      review,
      gradedAt: (row.gradedAt ?? new Date()).toISOString(),
    };
  }

  // ───────────── Scope and recommendations ─────────────

  private async currentLesson(userId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
      orderBy: { activatedAt: 'desc' },
      include: { currentLesson: { include: { unit: true } } },
    });
    return enrollment?.currentLesson ?? null;
  }

  /** The lesson or unit the learner picked, or else the one they are studying now. */
  private async lessonFor(userId: string, request: { lessonId?: string; unitId?: string }) {
    if (request.lessonId) {
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: request.lessonId, unit: { book: { ownerId: userId } } },
        include: { unit: true },
      });
      if (!lesson) throw notFound('Lesson not found.');
      return lesson;
    }
    if (request.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: request.unitId, book: { ownerId: userId } },
        include: { lessons: { take: 1 } },
      });
      if (!unit) throw notFound('Unit not found.');
      return { unitId: unit.id, unit, code: '', title: unit.title ?? '' };
    }
    const current = await this.currentLesson(userId);
    if (!current) throw new DomainError('CONFLICT', 409, 'Choose your current lesson first (open Books and pick one).');
    return current;
  }

  private async resolveScope(
    userId: string,
    request: CreateAssessment,
    now: Date,
  ): Promise<{ where: Prisma.LearningItemWhereInput; label: string; empty: string }> {
    const preset = request.preset;
    const base = { ownerId: userId, archivedAt: null } satisfies Prisma.LearningItemWhereInput;
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);

    switch (preset) {
      case 'LESSON':
      case 'UNIT': {
        const lesson = await this.lessonFor(userId, request);
        return preset === 'LESSON'
          ? {
              where: { ...base, sources: { some: { lessonId: (lesson as { id: string }).id } } },
              label: `${lesson.code} · ${lesson.title}`,
              empty: 'This lesson has no items yet. Add some first.',
            }
          : {
              where: { ...base, sources: { some: { lesson: { unitId: lesson.unitId } } } },
              label: `Unit ${lesson.unit.number}`,
              empty: 'This unit has no items yet. Add some first.',
            };
      }
      case 'WEAK_AREAS':
        return {
          where: {
            ...base,
            OR: [{ userStates: { some: { userId, isWeak: true } } }, { mistakes: { some: { userId, status: { in: ['ACTIVE', 'IMPROVING'] } } } }],
          },
          label: 'Weak areas',
          empty: 'Nothing is marked weak right now. That is good news.',
        };
      case 'WEEKLY':
      case 'MONTHLY': {
        const days = preset === 'WEEKLY' ? 7 : 30;
        return {
          where: { ...base, userStates: { some: { userId, lastReviewedAt: { gte: since(days) } } } },
          label: PRESET_LABELS[preset],
          empty: `You have not practised anything in the last ${days} days.`,
        };
      }
    }
  }

  private async recommend(
    userId: string,
    recent: { kind: string; createdAt: Date }[],
  ): Promise<AssessmentListDto['recommendations']> {
    const lesson = await this.currentLesson(userId);
    if (!lesson) return { quiz: null, exam: null };
    const now = Date.now();
    const base = { ownerId: userId, archivedAt: null } satisfies Prisma.LearningItemWhereInput;

    const lessonWhere = { ...base, sources: { some: { lessonId: lesson.id } } } satisfies Prisma.LearningItemWhereInput;
    const unitWhere = { ...base, sources: { some: { lesson: { unitId: lesson.unitId } } } } satisfies Prisma.LearningItemWhereInput;
    const [lessonCount, lessonSeen, unitCount, unitSettled] = await Promise.all([
      this.prisma.learningItem.count({ where: lessonWhere }),
      this.prisma.learningItem.count({ where: { ...lessonWhere, userStates: { some: { userId, status: { not: 'NEW' } } } } }),
      this.prisma.learningItem.count({ where: unitWhere }),
      this.prisma.learningItem.count({ where: { ...unitWhere, userStates: { some: { userId, status: { in: ['REVIEW', 'MASTERED'] } } } } }),
    ]);

    const lastQuiz = recent.find((r) => r.kind === 'QUIZ');
    const quiz = shouldRecommendQuiz({
      itemCount: lessonCount,
      seenCount: lessonSeen,
      daysSinceLastQuiz: lastQuiz ? (now - lastQuiz.createdAt.getTime()) / DAY_MS : null,
    });
    const exam = shouldRecommendExam({ itemCount: unitCount, settledCount: unitSettled });

    const quizRec: AssessmentRecommendation | null = quiz
      ? { preset: 'LESSON', reason: `You have seen ${lessonSeen} of ${lessonCount} items in ${lesson.code}. A quick quiz shows what stuck.` }
      : null;
    const examRec: AssessmentRecommendation | null = exam
      ? { preset: 'UNIT', reason: `${unitSettled} of ${unitCount} items in Unit ${lesson.unit.number} are settled. Ready to test the whole unit?` }
      : null;
    return { quiz: quizRec, exam: examRec };
  }
}

function markOf(q: AssessmentRow['questions'][number]): MarkedQuestion {
  const attempt = q.attempt;
  return {
    skill: q.skill as SkillArea,
    points: q.points,
    score: attempt ? attempt.score : null,
    verdict: attempt ? (attempt.verdict as MarkedQuestion['verdict']) : null,
  };
}

function toSummary(
  row: {
    id: string;
    kind: AssessmentKind;
    preset: AssessmentPreset;
    title: string;
    status: AssessmentSummaryDto['status'];
    timeLimitSec: number | null;
    score: number | null;
    xpEarned: number;
    createdAt: Date;
    gradedAt: Date | null;
  },
  questionCount: number,
): AssessmentSummaryDto {
  return {
    id: row.id,
    kind: row.kind,
    preset: row.preset,
    title: row.title,
    status: row.status,
    questionCount,
    timeLimitSec: row.timeLimitSec,
    score: row.score,
    xpEarned: row.xpEarned,
    createdAt: row.createdAt.toISOString(),
    gradedAt: row.gradedAt?.toISOString() ?? null,
  };
}
