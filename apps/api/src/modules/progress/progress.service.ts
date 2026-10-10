import { Injectable } from '@nestjs/common';
import {
  DAILY_GOAL_XP,
  advanceStreak,
  levelForXp,
  visibleStreak,
  xpForSession,
  type LevelProgress,
} from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Tx } from '../learning/learning.service.js';

const toDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** One answer never counts for more than this, so leaving a question open overnight is not "study time". */
const MAX_SECONDS_PER_ATTEMPT = 120;

export interface StreakInfo {
  current: number;
  longest: number;
}

/** Daily activity, XP and the streak. Every award is recorded once, so retries cannot double it. */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records the time and XP of one answer, and checks whether the daily goal was just reached. */
  async recordAttempt(
    tx: Tx,
    input: { userId: string; localDate: string; attemptId: string; xp: number; durationMs?: number | null; isCorrect: boolean },
  ): Promise<void> {
    const awarded = await tx.xpEvent.createMany({
      data: [{ userId: input.userId, amount: input.xp, reason: 'ATTEMPT', refId: input.attemptId }],
      skipDuplicates: true,
    });
    if (awarded.count === 0) return;

    const seconds = Math.min(Math.round((input.durationMs ?? 0) / 1000), MAX_SECONDS_PER_ATTEMPT);
    await tx.dailyActivity.upsert({
      where: { userId_localDate: { userId: input.userId, localDate: toDate(input.localDate) } },
      create: {
        userId: input.userId,
        localDate: toDate(input.localDate),
        attempts: 1,
        correct: input.isCorrect ? 1 : 0,
        activeSeconds: seconds,
        xp: input.xp,
      },
      update: {
        attempts: { increment: 1 },
        correct: { increment: input.isCorrect ? 1 : 0 },
        activeSeconds: { increment: seconds },
        xp: { increment: input.xp },
      },
    });
    await tx.userGamification.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, totalXp: input.xp },
      update: { totalXp: { increment: input.xp } },
    });
    await this.checkGoal(tx, input.userId, input.localDate);
  }

  /** The completion bonus. Completing a session always meets the daily goal. */
  async completeSession(
    tx: Tx,
    input: { userId: string; localDate: string; sessionId: string; answered: number; wrong: number },
  ): Promise<{ bonusXp: number }> {
    // `bonusXp` covers everything this call paid: the session bonus plus the daily-goal bonus if it was reached now.
    const bonusXp = xpForSession({ answered: input.answered, wrong: input.wrong });
    const awarded = await tx.xpEvent.createMany({
      data: [{ userId: input.userId, amount: bonusXp, reason: 'SESSION', refId: input.sessionId }],
      skipDuplicates: true,
    });
    if (awarded.count === 0) return { bonusXp };

    await tx.dailyActivity.upsert({
      where: { userId_localDate: { userId: input.userId, localDate: toDate(input.localDate) } },
      create: { userId: input.userId, localDate: toDate(input.localDate), sessionsCompleted: 1, xp: bonusXp },
      update: { sessionsCompleted: { increment: 1 }, xp: { increment: bonusXp } },
    });
    await tx.userGamification.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, totalXp: bonusXp },
      update: { totalXp: { increment: bonusXp } },
    });
    const goalXp = await this.checkGoal(tx, input.userId, input.localDate);
    return { bonusXp: bonusXp + goalXp };
  }

  /** Marks the day as a goal day (once), pays the goal bonus, and moves the streak forward. */
  private async checkGoal(tx: Tx, userId: string, localDate: string): Promise<number> {
    const activity = await tx.dailyActivity.findUnique({
      where: { userId_localDate: { userId, localDate: toDate(localDate) } },
    });
    if (!activity || activity.goalMet) return 0;

    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { dailyGoalMinutes: true } });
    const goalSeconds = (profile?.dailyGoalMinutes ?? 10) * 60;
    if (activity.activeSeconds < goalSeconds && activity.sessionsCompleted === 0) return 0;

    await tx.dailyActivity.update({
      where: { userId_localDate: { userId, localDate: toDate(localDate) } },
      data: { goalMet: true },
    });

    const bonus = await tx.xpEvent.createMany({
      data: [{ userId, amount: DAILY_GOAL_XP, reason: 'GOAL', refId: localDate }],
      skipDuplicates: true,
    });
    if (bonus.count > 0) {
      await tx.dailyActivity.update({
        where: { userId_localDate: { userId, localDate: toDate(localDate) } },
        data: { xp: { increment: DAILY_GOAL_XP } },
      });
      await tx.userGamification.update({ where: { userId }, data: { totalXp: { increment: DAILY_GOAL_XP } } });
    }

    const g = await tx.userGamification.findUnique({ where: { userId } });
    const next = advanceStreak(
      {
        currentStreak: g?.currentStreak ?? 0,
        longestStreak: g?.longestStreak ?? 0,
        lastStreakDate: dateOnly(g?.lastStreakDate ?? null),
      },
      localDate,
      true,
    );
    await tx.userGamification.upsert({
      where: { userId },
      create: { userId, currentStreak: next.currentStreak, longestStreak: next.longestStreak, lastStreakDate: toDate(localDate) },
      update: { currentStreak: next.currentStreak, longestStreak: next.longestStreak, lastStreakDate: toDate(localDate) },
    });
    return bonus.count > 0 ? DAILY_GOAL_XP : 0;
  }

  async streak(userId: string, today: string): Promise<StreakInfo & { goalMetToday: boolean }> {
    const [g, activity] = await Promise.all([
      this.prisma.userGamification.findUnique({ where: { userId } }),
      this.prisma.dailyActivity.findUnique({ where: { userId_localDate: { userId, localDate: toDate(today) } } }),
    ]);
    const state = {
      currentStreak: g?.currentStreak ?? 0,
      longestStreak: g?.longestStreak ?? 0,
      lastStreakDate: dateOnly(g?.lastStreakDate ?? null),
    };
    return { current: visibleStreak(state, today), longest: state.longestStreak, goalMetToday: activity?.goalMet ?? false };
  }

  async xp(userId: string): Promise<{ total: number } & LevelProgress> {
    const g = await this.prisma.userGamification.findUnique({ where: { userId } });
    const total = g?.totalXp ?? 0;
    return { total, ...levelForXp(total) };
  }

  async activityToday(userId: string, today: string): Promise<{ activeSeconds: number; goalMinutes: number; goalMet: boolean }> {
    const [activity, profile] = await Promise.all([
      this.prisma.dailyActivity.findUnique({ where: { userId_localDate: { userId, localDate: toDate(today) } } }),
      this.prisma.userProfile.findUnique({ where: { userId }, select: { dailyGoalMinutes: true } }),
    ]);
    return {
      activeSeconds: activity?.activeSeconds ?? 0,
      goalMinutes: profile?.dailyGoalMinutes ?? 10,
      goalMet: activity?.goalMet ?? false,
    };
  }
}
