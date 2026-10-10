import { Injectable } from '@nestjs/common';
import type {
  DailySessionDto,
  DailySessionEnvelope,
  SelectionReason,
  SessionExerciseDto,
  SessionResultDto,
  SessionSummaryDto,
  Verdict,
} from '@coach/contracts';
import {
  DEFAULT_WEIGHTS,
  daysBetween,
  planDailySession,
  scoreItem,
  teacherRecency,
  toLocalDate,
  usableExercises,
  type PlannerItem,
  type PoolExercise,
} from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ExercisesService, itemSelect, toClient, toInput, withItems, type ExerciseWithItems } from '../exercises/exercises.service.js';
import { LearningService, toPlannerState } from '../learning/learning.service.js';
import { AchievementsService } from '../progress/achievements.service.js';
import { ProgressService } from '../progress/progress.service.js';

const toDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
const MAX_SECONDS_PER_ATTEMPT = 120;
/** How many of the best-scoring items get exercises prepared when planning. */
const CANDIDATE_LIMIT = 40;
const MIN_CANDIDATE_SCORE = 0.3;

interface PlanMeta {
  summary: Partial<Record<SelectionReason, number>>;
  result?: SessionResultDto;
}

type SessionRow = Prisma.DailySessionGetPayload<{
  include: {
    items: {
      include: { exercise: { include: typeof withItems }; attempt: { select: { verdict: true; isCorrect: true; evaluation: true; score: true; durationMs: true } } };
    };
  };
}>;

const sessionInclude = {
  items: {
    orderBy: { position: 'asc' },
    include: {
      exercise: { include: withItems },
      attempt: { select: { verdict: true, isCorrect: true, evaluation: true, score: true, durationMs: true } },
    },
  },
} satisfies Prisma.DailySessionInclude;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
    private readonly learning: LearningService,
    private readonly progress: ProgressService,
    private readonly achievements: AchievementsService,
  ) {}

  /**
   * Today's session. Returns the one in progress; or, if today's is finished, that one (pass `extra`
   * for another); or plans the first of the day. Planning is rule-based and needs no AI.
   */
  async current(userId: string, extra: boolean): Promise<DailySessionEnvelope> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true, profile: { select: { sessionMinutes: true } } },
    });
    const now = new Date();
    const today = toLocalDate(now, user.timezone);

    const sessions = await this.prisma.dailySession.findMany({
      where: { userId, localDate: toDate(today) },
      orderBy: { ordinal: 'asc' },
      include: sessionInclude,
    });
    const open = sessions.find((s) => s.status === 'PLANNED' || s.status === 'IN_PROGRESS');
    if (open) return { session: this.toDto(open) };
    if (sessions.length > 0 && !extra) return { session: this.toDto(sessions[sessions.length - 1]!) };

    const ordinal = (sessions[sessions.length - 1]?.ordinal ?? 0) + 1;
    try {
      const id = await this.plan(userId, today, ordinal, now, (user.profile?.sessionMinutes ?? 10) * 60);
      if (!id) return { session: null, reason: 'NOTHING_TO_PRACTICE' };
      return { session: await this.get(userId, id) };
    } catch (error) {
      // Two requests planned the same session at once: use the one that won.
      if (isUniqueViolation(error)) return this.current(userId, false);
      throw error;
    }
  }

  async get(userId: string, sessionId: string): Promise<DailySessionDto> {
    const row = await this.prisma.dailySession.findFirst({ where: { id: sessionId, userId }, include: sessionInclude });
    if (!row) throw notFound('Session not found.');
    return this.toDto(row);
  }

  /** A short summary of today's latest session, for the dashboard. */
  async today(userId: string): Promise<SessionSummaryDto | null> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = toLocalDate(new Date(), user.timezone);
    const latest = await this.prisma.dailySession.findFirst({
      where: { userId, localDate: toDate(today) },
      orderBy: { ordinal: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    if (!latest) return null;
    const answered = await this.prisma.exerciseAttempt.count({ where: { sessionItem: { sessionId: latest.id } } });
    return {
      id: latest.id,
      status: latest.status,
      ordinal: latest.ordinal,
      total: latest._count.items,
      answeredCount: answered,
      plannedMinutes: Math.max(1, Math.round(latest.plannedSeconds / 60)),
      summary: (latest.planMeta as unknown as PlanMeta).summary ?? {},
    };
  }

  /** Finishes the session: awards the bonus, meets the daily goal, moves the streak. Safe to call twice. */
  async complete(userId: string, sessionId: string): Promise<SessionResultDto> {
    const row = await this.prisma.dailySession.findFirst({ where: { id: sessionId, userId }, include: sessionInclude });
    if (!row) throw notFound('Session not found.');
    const meta = row.planMeta as unknown as PlanMeta;
    if (row.status === 'COMPLETED' && meta.result) return { ...meta.result, newAchievements: meta.result.newAchievements ?? [] };

    const answered = row.items.flatMap((i) => (i.attempt ? [i.attempt] : []));
    if (answered.length === 0) {
      throw new DomainError('CONFLICT', 409, 'Answer at least one exercise before finishing.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = toLocalDate(new Date(), user.timezone);
    const count = (v: Verdict) => answered.filter((a) => a.verdict === v).length;
    const wrong = count('wrong');
    const attemptXp = answered.reduce((sum, a) => sum + ((a.evaluation as { xp?: number }).xp ?? 0), 0);
    const activeSeconds = answered.reduce((sum, a) => sum + Math.min(Math.round((a.durationMs ?? 0) / 1000), MAX_SECONDS_PER_ATTEMPT), 0);
    const accuracy = answered.reduce((sum, a) => sum + a.score, 0) / answered.length;

    const { bonusXp } = await this.prisma.$transaction(async (tx) => {
      const award = await this.progress.completeSession(tx, {
        userId,
        localDate: today,
        sessionId,
        answered: answered.length,
        wrong,
      });
      return award;
    });

    const streak = await this.progress.streak(userId, today);
    const base: Omit<SessionResultDto, 'newAchievements'> = {
      answered: answered.length,
      correct: count('correct'),
      almost: count('almost'),
      wrong,
      accuracy,
      xpEarned: attemptXp + bonusXp,
      activeSeconds,
      streak: { current: streak.current, longest: streak.longest, goalMetToday: streak.goalMetToday },
    };
    // Mark it finished first: achievements count finished sessions, this one included.
    await this.prisma.dailySession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date(), score: accuracy, activeSeconds, xpEarned: base.xpEarned },
    });
    // A hiccup while checking achievements must never lose the learner's finished session.
    const newAchievements = await this.achievements.check(userId).catch(() => []);
    const result: SessionResultDto = { ...base, newAchievements };
    await this.prisma.dailySession.update({
      where: { id: sessionId },
      data: { planMeta: { ...meta, result } as unknown as Prisma.InputJsonValue },
    });
    return result;
  }

  // ───────────── Planning ─────────────

  /** Gathers everything the planner needs, runs it, and stores the session. Returns null when there is nothing to practise. */
  private async plan(userId: string, today: string, ordinal: number, now: Date, budgetSeconds: number): Promise<string | null> {
    const items = await this.prisma.learningItem.findMany({
      where: { ownerId: userId, archivedAt: null },
      select: { ...itemSelect, sources: { select: { lessonId: true, teacherSession: { select: { classDate: true } } } } },
      take: 500,
    });
    if (items.length === 0) return null;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
      orderBy: { activatedAt: 'desc' },
      select: { currentLessonId: true },
    });
    const context = await this.learning.contextFor(userId, items.map((i) => i.id), now, today);

    const planners = items.map((item) => {
      const ctx = context.get(item.id)!;
      const classDays = item.sources.flatMap((s) =>
        s.teacherSession ? [daysBetween(s.teacherSession.classDate.toISOString().slice(0, 10), today)] : [],
      );
      return {
        item,
        planner: {
          id: item.id,
          state: toPlannerState(ctx.state, now),
          mistakePriority: ctx.mistakePriority,
          inCurrentLesson: enrollment?.currentLessonId ? item.sources.some((s) => s.lessonId === enrollment.currentLessonId) : false,
          teacherRecency: classDays.length > 0 ? teacherRecency(Math.min(...classDays)) : 0,
          seenToday: ctx.seenToday,
          pool: [] as PoolExercise[],
        } satisfies PlannerItem,
      };
    });

    // Only the most promising items get exercises prepared; the rest cannot make the session anyway.
    const promising = planners
      .map((p) => ({ ...p, score: scoreItem(p.planner, now, DEFAULT_WEIGHTS).score }))
      .filter((p) => p.score >= MIN_CANDIDATE_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_LIMIT);
    if (promising.length === 0) return null;

    await this.exercises.ensureTemplatesFor(userId, promising.map((p) => toInput(p.item)));
    const ids = promising.map((p) => p.item.id);
    const [pool, recent, rules] = await Promise.all([
      this.exercises.poolFor(userId, ids),
      this.exercises.recentExerciseIds(userId),
      this.learning.difficultyFor(userId),
    ]);
    for (const p of promising) {
      p.planner.pool = usableExercises(pool.get(p.item.id) ?? [], rules).map((e) => ({
        id: e.id,
        format: e.format as PoolExercise['format'],
        level: e.level,
        estimatedSeconds: e.estimatedSeconds,
        recentlyAnswered: recent.has(e.id),
      }));
    }

    const plan = planDailySession(promising.map((p) => p.planner), { budgetSeconds, maxNewItems: 5, startLevel: rules.startLevel, now }, Math.random);
    if (plan.steps.length === 0) return null;

    const session = await this.prisma.dailySession.create({
      data: {
        userId,
        localDate: toDate(today),
        ordinal,
        plannedSeconds: plan.plannedSeconds,
        planMeta: { summary: plan.summary, plannerVersion: 1, budgetSeconds } as unknown as Prisma.InputJsonValue,
        items: {
          create: plan.steps.map((s, position) => ({
            position,
            block: s.block,
            exerciseId: s.exerciseId,
            itemId: s.itemId,
            reason: s.reason,
          })),
        },
      },
    });
    return session.id;
  }

  private toDto(row: SessionRow): DailySessionDto {
    const meta = row.planMeta as unknown as PlanMeta;
    const exercises: SessionExerciseDto[] = row.items.map((i) => ({
      ...toClient(i.exercise as ExerciseWithItems),
      sessionItemId: i.id,
      position: i.position,
      block: i.block,
      reason: i.reason,
      answered: i.attempt ? { verdict: i.attempt.verdict as Verdict, isCorrect: i.attempt.isCorrect } : null,
    }));
    return {
      id: row.id,
      status: row.status,
      localDate: row.localDate.toISOString().slice(0, 10),
      ordinal: row.ordinal,
      plannedSeconds: row.plannedSeconds,
      total: exercises.length,
      answeredCount: exercises.filter((e) => e.answered).length,
      summary: meta.summary ?? {},
      exercises,
      result: meta.result ?? null,
    };
  }
}
