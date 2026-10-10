import { Injectable } from '@nestjs/common';
import {
  ITEM_TYPE_META,
  type BookProgress,
  type DayStat,
  type ItemGroupProgress,
  type ItemType,
  type ProgressDto,
  type TypeProgress,
  type UnitProgress,
  type WeekStat,
} from '@coach/contracts';
import { addDays, levelForXp, toLocalDate } from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const startOf = (localDate: string) => new Date(`${localDate}T00:00:00Z`);
const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

/** Counts what the learner has met and mastered in a group of items. An item with no history counts as unseen. */
class Group {
  items = 0;
  seen = 0;
  mastered = 0;
  masterySum = 0;

  add(state: { status: string; mastery: number; reps: number } | undefined): void {
    this.items++;
    if (!state) return;
    if (state.reps > 0) this.seen++;
    if (state.status === 'MASTERED') this.mastered++;
    this.masterySum += state.mastery;
  }

  result(): ItemGroupProgress {
    return {
      items: this.items,
      seen: this.seen,
      mastered: this.mastered,
      avgMastery: this.items === 0 ? 0 : this.masterySum / this.items,
    };
  }
}

/** Everything the Progress page shows, from what the learner has actually done. */
@Injectable()
export class ProgressReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(userId: string, days: number): Promise<ProgressDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const today = toLocalDate(new Date(), user.timezone);
    const first = addDays(today, -(days - 1));
    // Two weeks are always needed for the weekly comparison, whatever range is shown.
    const since = addDays(today, -Math.max(days, 14) + 1);

    const [activity, gamification, items, graded] = await Promise.all([
      this.prisma.dailyActivity.findMany({ where: { userId, localDate: { gte: startOf(since) } } }),
      this.prisma.userGamification.findUnique({ where: { userId } }),
      this.prisma.learningItem.findMany({
        where: { ownerId: userId, archivedAt: null },
        select: {
          type: true,
          userStates: { where: { userId }, select: { status: true, mastery: true, reps: true, isWeak: true, firstSeenAt: true } },
          sources: { select: { lesson: { select: { unitId: true, unit: { select: { id: true, number: true, title: true, bookId: true, book: { select: { id: true, title: true } } } } } } } },
        },
      }),
      this.prisma.assessment.findMany({
        where: { userId, status: 'GRADED' },
        orderBy: { gradedAt: 'desc' },
        take: 200,
        select: { id: true, kind: true, title: true, score: true, gradedAt: true },
      }),
    ]);

    const byDate = new Map(activity.map((a) => [dayKey(a.localDate), a]));
    const dayStat = (date: string): DayStat => {
      const a = byDate.get(date);
      return {
        date,
        minutes: Math.round((a?.activeSeconds ?? 0) / 60),
        xp: a?.xp ?? 0,
        attempts: a?.attempts ?? 0,
        correct: a?.correct ?? 0,
        sessions: a?.sessionsCompleted ?? 0,
        goalMet: a?.goalMet ?? false,
      };
    };
    const daily = Array.from({ length: days }, (_, i) => dayStat(addDays(first, i)));

    const attempts = daily.reduce((n, d) => n + d.attempts, 0);
    const correct = daily.reduce((n, d) => n + d.correct, 0);
    const inRange = graded.filter((a) => a.gradedAt && dayKey(a.gradedAt) >= first);
    const scores = (kind: 'QUIZ' | 'EXAM') => inRange.filter((a) => a.kind === kind).map((a) => a.score ?? 0);

    const week = (from: string): WeekStat => {
      const rows = Array.from({ length: 7 }, (_, i) => dayStat(addDays(from, i)));
      const a = rows.reduce((n, d) => n + d.attempts, 0);
      const c = rows.reduce((n, d) => n + d.correct, 0);
      const end = addDays(from, 6);
      return {
        minutes: rows.reduce((n, d) => n + d.minutes, 0),
        xp: rows.reduce((n, d) => n + d.xp, 0),
        sessions: rows.reduce((n, d) => n + d.sessions, 0),
        attempts: a,
        accuracy: ratio(c, a),
        activeDays: rows.filter((d) => d.attempts > 0).length,
        newItems: items.filter((i) => {
          const seen = i.userStates[0]?.firstSeenAt;
          return seen ? dayKey(seen) >= from && dayKey(seen) <= end : false;
        }).length,
      };
    };

    // Items, grouped three ways: by status, by type, and by where they sit in the books.
    const types = new Map<ItemType, Group>();
    const books = new Map<string, { title: string; group: Group; units: Map<string, { number: number; title: string | null; group: Group }> }>();
    const statuses = { new: 0, learning: 0, review: 0, mastered: 0, weak: 0, total: items.length };
    for (const item of items) {
      const state = item.userStates[0];
      (types.get(item.type) ?? types.set(item.type, new Group()).get(item.type)!).add(state);
      const status = (state?.status ?? 'NEW').toLowerCase() as 'new' | 'learning' | 'review' | 'mastered';
      statuses[status]++;
      if (state?.isWeak) statuses.weak++;

      const seenUnits = new Set<string>();
      const seenBooks = new Set<string>();
      for (const { lesson } of item.sources) {
        if (!lesson) continue;
        const { unit } = lesson;
        const book = books.get(unit.bookId) ?? books.set(unit.bookId, { title: unit.book.title, group: new Group(), units: new Map() }).get(unit.bookId)!;
        if (!seenBooks.has(unit.bookId)) {
          seenBooks.add(unit.bookId);
          book.group.add(state);
        }
        if (!seenUnits.has(unit.id)) {
          seenUnits.add(unit.id);
          const entry = book.units.get(unit.id) ?? book.units.set(unit.id, { number: unit.number, title: unit.title, group: new Group() }).get(unit.id)!;
          entry.group.add(state);
        }
      }
    }

    const typeRows: TypeProgress[] = [...types.entries()]
      .map(([type, group]) => ({ type, label: ITEM_TYPE_META[type].plural, ...group.result() }))
      .sort((a, b) => b.items - a.items);

    // Books the learner owns appear even before they hold any items, so a new book is not invisible.
    const owned = await this.prisma.book.findMany({
      where: { ownerId: userId },
      select: { id: true, title: true, units: { orderBy: { number: 'asc' }, select: { id: true, number: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const bookRows: BookProgress[] = owned.map((b) => {
      const known = books.get(b.id);
      const units: UnitProgress[] = b.units.map((u) => ({
        unitId: u.id,
        number: u.number,
        title: u.title,
        ...(known?.units.get(u.id)?.group.result() ?? new Group().result()),
      }));
      return { bookId: b.id, title: b.title, ...(known?.group.result() ?? new Group().result()), units };
    });

    const totalXp = gamification?.totalXp ?? 0;
    const level = levelForXp(totalXp);
    return {
      days,
      today,
      totals: {
        activeMinutes: daily.reduce((n, d) => n + d.minutes, 0),
        activeDays: daily.filter((d) => d.attempts > 0).length,
        sessions: daily.reduce((n, d) => n + d.sessions, 0),
        attempts,
        accuracy: ratio(correct, attempts),
        xp: daily.reduce((n, d) => n + d.xp, 0),
        quizzes: scores('QUIZ').length,
        avgQuizScore: mean(scores('QUIZ')),
        exams: scores('EXAM').length,
        avgExamScore: mean(scores('EXAM')),
      },
      daily,
      streak: { current: gamification?.currentStreak ?? 0, longest: gamification?.longestStreak ?? 0 },
      level: { level: level.level, total: totalXp, intoLevel: level.xpIntoLevel, forLevel: level.xpForLevel },
      statuses,
      types: typeRows,
      books: bookRows,
      week: { thisWeek: week(addDays(today, -6)), lastWeek: week(addDays(today, -13)) },
      recentAssessments: graded.slice(0, 5).map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        score: a.score ?? 0,
        gradedAt: (a.gradedAt ?? new Date()).toISOString(),
      })),
    };
  }
}
