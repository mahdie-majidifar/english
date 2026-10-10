import { Injectable } from '@nestjs/common';
import type { ChallengeDto, ChallengesDto } from '@coach/contracts';
import {
  challengeProgress,
  challengeRewardKey,
  dailyChallenge,
  toLocalDate,
  weekStart,
  weeklyChallenge,
  type ChallengeDef,
  type ChallengeMetrics,
} from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { ProgressService } from './progress.service.js';

const toDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);

/**
 * One challenge a day and one a week. Which one is decided by the date (no stored schedule), and the
 * reward is paid once, the first time the learner looks after finishing it.
 */
@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
  ) {}

  async current(userId: string): Promise<ChallengesDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = toLocalDate(new Date(), user.timezone);

    const [dayMetrics, weekMetrics] = await Promise.all([this.metrics(userId, today, today), this.metrics(userId, weekStart(today), today)]);
    const defs = [
      { def: dailyChallenge(userId, today), metrics: dayMetrics },
      { def: weeklyChallenge(userId, today), metrics: weekMetrics },
    ];

    const justCompleted: ChallengeDto[] = [];
    const dtos: ChallengeDto[] = [];
    for (const { def, metrics } of defs) {
      const status = challengeProgress(def, metrics);
      const dto = toDto(def, status);
      dtos.push(dto);
      if (!status.done) continue;
      const paid = await this.prisma.$transaction((tx) =>
        this.progress.recordBonus(tx, { userId, localDate: today, reason: 'CHALLENGE', refId: challengeRewardKey(def, today), xp: def.rewardXp }),
      );
      if (paid > 0) justCompleted.push(dto);
    }
    return { daily: dtos[0]!, weekly: dtos[1]!, justCompleted };
  }

  /** What the learner did between two local dates, both included. */
  private async metrics(userId: string, from: string, to: string): Promise<ChallengeMetrics> {
    const rows = await this.prisma.dailyActivity.findMany({ where: { userId, localDate: { gte: toDate(from), lte: toDate(to) } } });
    return {
      attempts: rows.reduce((n, r) => n + r.attempts, 0),
      correct: rows.reduce((n, r) => n + r.correct, 0),
      minutes: Math.floor(rows.reduce((n, r) => n + r.activeSeconds, 0) / 60),
      xp: rows.reduce((n, r) => n + r.xp, 0),
      sessions: rows.reduce((n, r) => n + r.sessionsCompleted, 0),
      activeDays: rows.filter((r) => r.attempts > 0).length,
    };
  }
}

function toDto(def: ChallengeDef, status: { progress: number; target: number; done: boolean }): ChallengeDto {
  return {
    kind: def.kind,
    code: def.code,
    title: def.title,
    description: def.description,
    progress: status.progress,
    target: status.target,
    rewardXp: def.rewardXp,
    done: status.done,
  };
}

