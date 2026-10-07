import { Injectable } from '@nestjs/common';
import { ERROR_TYPES, type DashboardDto, type ErrorTypeCode, type WeakArea } from '@coach/contracts';
import { decayPriority, toLocalDate } from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { MistakesService } from '../learning/mistakes.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { SessionsService } from '../sessions/sessions.service.js';

const DAY_MS = 86_400_000;

/** One call that gathers everything the home screen shows. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly sessions: SessionsService,
    private readonly progress: ProgressService,
    private readonly mistakes: MistakesService,
  ) {}

  async get(userId: string): Promise<DashboardDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const now = new Date();
    const today = toLocalDate(now, user.timezone);

    const [session, activity, current, streak, xp, mistakes, weakAreas, reviews, totals] = await Promise.all([
      this.sessions.today(userId),
      this.progress.activityToday(userId, today),
      this.catalog.getCurrent(userId),
      this.progress.streak(userId, today),
      this.progress.xp(userId),
      this.mistakes.summary(userId),
      this.weakAreas(userId, now),
      this.reviews(userId, now),
      this.totals(userId),
    ]);

    return {
      today: {
        session,
        goalMinutes: activity.goalMinutes,
        activeMinutes: Math.floor(activity.activeSeconds / 60),
        goalMet: activity.goalMet,
      },
      current,
      streak: { current: streak.current, longest: streak.longest },
      xp: { total: xp.total, level: xp.level, intoLevel: xp.xpIntoLevel, forLevel: xp.xpForLevel },
      weakAreas,
      reviews,
      mistakes,
      totals,
    };
  }

  /** Error patterns first (the same kind of mistake across words), then individual weak items. */
  private async weakAreas(userId: string, now: Date): Promise<WeakArea[]> {
    const [open, weakStates] = await Promise.all([
      this.prisma.mistake.findMany({
        where: { userId, status: { in: ['ACTIVE', 'IMPROVING'] }, item: { archivedAt: null } },
        select: { errorCode: true, priority: true, lastSeenAt: true, item: { select: { id: true, headword: true } } },
      }),
      this.prisma.userItemState.findMany({
        where: { userId, isWeak: true, item: { archivedAt: null } },
        orderBy: { mastery: 'asc' },
        take: 5,
        select: { item: { select: { id: true, headword: true } }, mastery: true },
      }),
    ]);

    const byCode = new Map<string, { score: number; items: Map<string, string> }>();
    for (const m of open) {
      const entry = byCode.get(m.errorCode) ?? { score: 0, items: new Map() };
      entry.score += decayPriority(m.priority, (now.getTime() - m.lastSeenAt.getTime()) / DAY_MS);
      entry.items.set(m.item.id, m.item.headword);
      byCode.set(m.errorCode, entry);
    }

    const areas: WeakArea[] = [...byCode.entries()]
      .filter(([code]) => code !== 'OTHER.OTHER')
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([code, entry]) => {
        const meta = ERROR_TYPES[code as ErrorTypeCode] ?? ERROR_TYPES['OTHER.OTHER'];
        return {
          kind: 'error' as const,
          label: meta.labelEn,
          labelFa: meta.labelFa,
          count: entry.items.size,
          items: [...entry.items].slice(0, 3).map(([id, headword]) => ({ id, headword })),
        };
      });

    const shownItems = new Set(areas.flatMap((a) => a.items.map((i) => i.id)));
    for (const s of weakStates) {
      if (areas.length >= 5) break;
      if (shownItems.has(s.item.id)) continue;
      areas.push({ kind: 'item', label: s.item.headword, count: 1, items: [s.item] });
    }
    return areas;
  }

  private async reviews(userId: string, now: Date): Promise<DashboardDto['reviews']> {
    const where = { userId, status: { not: 'NEW' as const }, due: { not: null }, item: { archivedAt: null } };
    const [dueCount, upcoming] = await Promise.all([
      this.prisma.userItemState.count({ where: { ...where, due: { lte: now } } }),
      this.prisma.userItemState.findMany({
        where,
        orderBy: { due: 'asc' },
        take: 5,
        select: { due: true, item: { select: { id: true, headword: true } } },
      }),
    ]);
    return {
      dueCount,
      upcoming: upcoming.map((u) => ({ itemId: u.item.id, headword: u.item.headword, due: u.due!.toISOString() })),
    };
  }

  private async totals(userId: string): Promise<DashboardDto['totals']> {
    const [items, states] = await Promise.all([
      this.prisma.learningItem.count({ where: { ownerId: userId, archivedAt: null } }),
      this.prisma.userItemState.groupBy({
        by: ['status'],
        where: { userId, item: { archivedAt: null } },
        _count: { _all: true },
      }),
    ]);
    const count = (s: string) => states.find((g) => g.status === s)?._count._all ?? 0;
    const learning = count('LEARNING');
    const review = count('REVIEW');
    const mastered = count('MASTERED');
    return { items, new: Math.max(0, items - learning - review - mastered), learning, review, mastered };
  }
}
