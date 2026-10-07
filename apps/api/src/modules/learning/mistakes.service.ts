import { Injectable } from '@nestjs/common';
import {
  ERROR_TYPES,
  type ErrorTypeCode,
  type MistakeDto,
  type MistakeListQuery,
  type MistakeSummary,
} from '@coach/contracts';
import { decayPriority, isRepeated } from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';

const DAY_MS = 86_400_000;

const bucket = (priority: number): MistakeDto['priority'] => (priority >= 2.5 ? 'HIGH' : priority >= 1 ? 'MEDIUM' : 'LOW');

@Injectable()
export class MistakesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: MistakeListQuery): Promise<MistakeDto[]> {
    const now = new Date();
    const rows = await this.prisma.mistake.findMany({
      where: {
        userId,
        status: query.status === 'open' ? { in: ['ACTIVE', 'IMPROVING'] } : query.status === 'resolved' ? 'RESOLVED' : undefined,
        item: { archivedAt: null },
      },
      include: {
        item: { select: { id: true, headword: true, type: true } },
        occurrenceLog: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 400,
    });

    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
    const recentCounts = await this.prisma.mistakeOccurrence.groupBy({
      by: ['mistakeId'],
      where: { mistakeId: { in: rows.map((r) => r.id) }, createdAt: { gte: twoWeeksAgo } },
      _count: { _all: true },
    });
    const recent = new Map(recentCounts.map((c) => [c.mistakeId, c._count._all]));

    return rows
      .map((m) => {
        const faded = decayPriority(m.priority, (now.getTime() - m.lastSeenAt.getTime()) / DAY_MS);
        const meta = ERROR_TYPES[m.errorCode as ErrorTypeCode] ?? ERROR_TYPES['OTHER.OTHER'];
        return {
          faded,
          dto: {
            id: m.id,
            item: m.item,
            errorCode: m.errorCode as ErrorTypeCode,
            errorLabelEn: meta.labelEn,
            errorLabelFa: meta.labelFa,
            status: m.status,
            occurrences: m.occurrences,
            repeated: isRepeated(recent.get(m.id) ?? 0),
            correctDaysNeeded: m.status === 'RESOLVED' ? 0 : Math.max(0, 3 - m.correctDays),
            priority: bucket(faded),
            lastSeenAt: m.lastSeenAt.toISOString(),
            recent: m.occurrenceLog.map((o) => ({
              userAnswer: o.userAnswer,
              expectedAnswer: o.expectedAnswer,
              createdAt: o.createdAt.toISOString(),
            })),
          } satisfies MistakeDto,
        };
      })
      .sort((a, b) => b.faded - a.faded)
      .slice(0, query.limit)
      .map((r) => r.dto);
  }

  async summary(userId: string): Promise<MistakeSummary> {
    const now = new Date();
    const [grouped, repeated] = await Promise.all([
      this.prisma.mistake.groupBy({ by: ['status'], where: { userId, item: { archivedAt: null } }, _count: { _all: true } }),
      this.prisma.mistakeOccurrence.groupBy({
        by: ['mistakeId'],
        where: { createdAt: { gte: new Date(now.getTime() - 14 * DAY_MS) }, mistake: { userId, status: { not: 'RESOLVED' } } },
        _count: { _all: true },
      }),
    ]);
    const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      active: count('ACTIVE'),
      improving: count('IMPROVING'),
      resolved: count('RESOLVED'),
      repeated: repeated.filter((r) => isRepeated(r._count._all)).length,
    };
  }
}
