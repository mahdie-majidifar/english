import { Injectable } from '@nestjs/common';
import type { AchievementBadge, AchievementDto, AchievementsDto } from '@coach/contracts';
import {
  ACHIEVEMENTS,
  BOSS_WIN_SCORE,
  evaluateAchievements,
  findAchievement,
  levelForXp,
  type AchievementStats,
} from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';

/** Fewer questions than this and a perfect score proves little. */
const MIN_PERFECT_QUESTIONS = 5;
const MIN_EXAM_QUESTIONS = 10;

export const badgeOf = (code: string): AchievementBadge | null => {
  const def = findAchievement(code);
  return def ? { code: def.code, title: def.title, description: def.description, icon: def.icon } : null;
};

/** Works out which achievements a learner has earned and remembers each one once. */
@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  async statsFor(userId: string): Promise<AchievementStats> {
    const [sessions, gamification, itemsSeen, itemsMastered, mistakesResolved, graded, challengesDone] = await Promise.all([
      this.prisma.dailySession.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.userGamification.findUnique({ where: { userId } }),
      this.prisma.userItemState.count({ where: { userId, reps: { gt: 0 }, item: { archivedAt: null } } }),
      this.prisma.userItemState.count({ where: { userId, status: 'MASTERED' } }),
      this.prisma.mistake.count({ where: { userId, status: 'RESOLVED' } }),
      this.prisma.assessment.findMany({
        where: { userId, status: 'GRADED' },
        select: { kind: true, preset: true, score: true, _count: { select: { questions: true } } },
      }),
      this.prisma.xpEvent.count({ where: { userId, reason: 'CHALLENGE' } }),
    ]);

    const quizzes = graded.filter((a) => a.kind === 'QUIZ');
    const exams = graded.filter((a) => a.kind === 'EXAM');
    const best = (list: typeof graded, minQuestions: number) =>
      list.filter((a) => a._count.questions >= minQuestions).reduce<number | null>((m, a) => Math.max(m ?? 0, a.score ?? 0), null);

    return {
      sessions,
      longestStreak: gamification?.longestStreak ?? 0,
      level: levelForXp(gamification?.totalXp ?? 0).level,
      itemsSeen,
      itemsMastered,
      mistakesResolved,
      quizzes: quizzes.length,
      exams: exams.length,
      bestQuiz: best(quizzes, 1),
      bestExam: best(exams, MIN_EXAM_QUESTIONS),
      challengesDone,
      bossesWon: graded.filter((a) => a.preset === 'BOSS' && (a.score ?? 0) >= BOSS_WIN_SCORE).length,
      perfectTests: graded.filter((a) => (a.score ?? 0) >= 0.999 && a._count.questions >= MIN_PERFECT_QUESTIONS).length,
    };
  }

  /** Records whatever has just been earned. Returns only the new ones, so they are celebrated once. */
  async check(userId: string): Promise<AchievementBadge[]> {
    const [have, stats] = await Promise.all([
      this.prisma.userAchievement.findMany({ where: { userId }, select: { code: true } }),
      this.statsFor(userId),
    ]);
    const known = new Set(have.map((h) => h.code));
    const fresh = evaluateAchievements(stats).filter((a) => a.done && !known.has(a.code));
    if (fresh.length === 0) return [];

    const created = await this.prisma.userAchievement.createMany({
      data: fresh.map((a) => ({ userId, code: a.code })),
      skipDuplicates: true,
    });
    // A concurrent check may have recorded some first; then there is nothing new to announce.
    if (created.count === 0) return [];
    return fresh.flatMap((a) => badgeOf(a.code) ?? []);
  }

  /** Every achievement with progress, earned ones first. Looking at the page also catches up on anything missed. */
  async list(userId: string): Promise<AchievementsDto> {
    const newlyUnlocked = await this.check(userId);
    const [rows, stats] = await Promise.all([this.prisma.userAchievement.findMany({ where: { userId } }), this.statsFor(userId)]);
    const unlockedAt = new Map(rows.map((r) => [r.code, r.unlockedAt]));
    const progress = new Map(evaluateAchievements(stats).map((p) => [p.code, p]));

    const achievements: AchievementDto[] = ACHIEVEMENTS.map((def) => ({
      code: def.code,
      title: def.title,
      description: def.description,
      icon: def.icon,
      progress: progress.get(def.code)?.progress ?? 0,
      target: def.target,
      unlockedAt: unlockedAt.get(def.code)?.toISOString() ?? null,
    })).sort((a, b) => {
      if (Boolean(a.unlockedAt) !== Boolean(b.unlockedAt)) return a.unlockedAt ? -1 : 1;
      // Earned: newest first. Not yet: closest first.
      return a.unlockedAt && b.unlockedAt ? b.unlockedAt.localeCompare(a.unlockedAt) : b.progress / b.target - a.progress / a.target;
    });

    return { unlocked: rows.length, total: ACHIEVEMENTS.length, achievements, newlyUnlocked };
  }
}
