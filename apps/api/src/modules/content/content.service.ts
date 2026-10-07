import { Injectable } from '@nestjs/common';
import { normalizeKey } from '@coach/domain';
import {
  parseItemPayload,
  type CreateItem,
  type Item,
  type ItemListQuery,
  type ItemListResponse,
  type ItemType,
  type SearchResponse,
  type UpdateItem,
} from '@coach/contracts';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

const itemInclude = {
  sources: {
    include: {
      lesson: { include: { unit: { include: { book: { select: { id: true, title: true } } } } } },
      teacherSession: { select: { id: true, title: true, classDate: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.LearningItemInclude;

type ItemRow = Prisma.LearningItemGetPayload<{ include: typeof itemInclude }>;

const duplicate = (headword: string) =>
  new DomainError('CONFLICT', 409, `"${headword}" is already in your library.`);

export function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    type: row.type,
    headword: row.headword,
    meaningEn: row.meaningEn,
    meaningFa: row.meaningFa,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    source: row.source,
    lessons: row.sources.flatMap((link) =>
      link.lesson
        ? [
            {
              id: link.lesson.id,
              code: link.lesson.code,
              title: link.lesson.title,
              unitNumber: link.lesson.unit.number,
              bookId: link.lesson.unit.book.id,
              bookTitle: link.lesson.unit.book.title,
            },
          ]
        : [],
    ),
    sessions: row.sources.flatMap((link) =>
      link.teacherSession
        ? [{ id: link.teacherSession.id, title: link.teacherSession.title, classDate: link.teacherSession.classDate.toISOString().slice(0, 10) }]
        : [],
    ),
    // Learning state (FSRS, mastery) arrives in phase 4. Until then everything is new.
    status: 'NEW',
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateItem): Promise<Item> {
    await this.assertLessonsOwned(userId, dto.lessonIds);
    const payload = this.cleanPayload(dto.type, dto.payload);
    const normalizedKey = normalizeKey(dto.headword);

    const existing = await this.prisma.learningItem.findUnique({
      where: { ownerId_type_normalizedKey: { ownerId: userId, type: dto.type, normalizedKey } },
      select: { id: true, archivedAt: true },
    });
    if (existing && !existing.archivedAt) throw duplicate(dto.headword);

    try {
      const row = existing
        ? // Re-adding something that was removed brings it back with the new details.
          await this.prisma.learningItem.update({
            where: { id: existing.id },
            data: {
              headword: dto.headword,
              meaningEn: dto.meaningEn ?? null,
              meaningFa: dto.meaningFa ?? null,
              payload,
              archivedAt: null,
              sources: {
                deleteMany: { lessonId: { not: null } },
                create: dto.lessonIds.map((lessonId) => ({ lessonId })),
              },
            },
            include: itemInclude,
          })
        : await this.prisma.learningItem.create({
            data: {
              ownerId: userId,
              type: dto.type,
              headword: dto.headword,
              normalizedKey,
              meaningEn: dto.meaningEn ?? null,
              meaningFa: dto.meaningFa ?? null,
              payload,
              sources: { create: dto.lessonIds.map((lessonId) => ({ lessonId })) },
            },
            include: itemInclude,
          });
      return toItem(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate(dto.headword);
      throw error;
    }
  }

  async get(userId: string, itemId: string): Promise<Item> {
    const row = await this.prisma.learningItem.findFirst({
      where: { id: itemId, ownerId: userId, archivedAt: null },
      include: itemInclude,
    });
    if (!row) throw notFound('Item not found.');
    return toItem(row);
  }

  async list(userId: string, query: ItemListQuery): Promise<ItemListResponse> {
    const base = this.baseWhere(userId, query);
    const where: Prisma.LearningItemWhereInput = { ...base, ...(query.type ? { type: query.type } : {}) };

    const [rows, grouped] = await Promise.all([
      this.prisma.learningItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.learningItem.groupBy({ by: ['type'], where: base, _count: { _all: true } }),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const counts: Partial<Record<ItemType, number>> = {};
    for (const g of grouped) counts[g.type] = g._count._all;

    return {
      items: page.map(toItem),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      counts,
    };
  }

  async update(userId: string, itemId: string, dto: UpdateItem): Promise<Item> {
    const existing = await this.prisma.learningItem.findFirst({
      where: { id: itemId, ownerId: userId, archivedAt: null },
    });
    if (!existing) throw notFound('Item not found.');
    if (dto.lessonIds) await this.assertLessonsOwned(userId, dto.lessonIds);

    const payload = dto.payload !== undefined ? this.cleanPayload(existing.type, dto.payload) : undefined;

    try {
      const row = await this.prisma.learningItem.update({
        where: { id: itemId },
        data: {
          ...(dto.headword !== undefined
            ? { headword: dto.headword, normalizedKey: normalizeKey(dto.headword) }
            : {}),
          ...(dto.meaningEn !== undefined ? { meaningEn: dto.meaningEn } : {}),
          ...(dto.meaningFa !== undefined ? { meaningFa: dto.meaningFa } : {}),
          ...(payload !== undefined ? { payload } : {}),
          ...(dto.lessonIds
            ? { sources: { deleteMany: { lessonId: { not: null } }, create: dto.lessonIds.map((lessonId) => ({ lessonId })) } }
            : {}),
        },
        include: itemInclude,
      });
      return toItem(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate(dto.headword ?? existing.headword);
      throw error;
    }
  }

  /** Items are archived, not deleted, so past attempts and mistakes (later phases) keep their meaning. */
  async archive(userId: string, itemId: string): Promise<void> {
    const result = await this.prisma.learningItem.updateMany({
      where: { id: itemId, ownerId: userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) throw notFound('Item not found.');
  }

  async search(userId: string, q: string): Promise<SearchResponse> {
    const term = q.trim();
    if (term.length < 1) return { query: term, results: [] };

    const rows = await this.prisma.learningItem.findMany({
      where: { ownerId: userId, archivedAt: null, ...this.textFilter(term) },
      include: itemInclude,
      take: 40,
    });

    const lower = term.toLowerCase();
    const rank = (r: ItemRow) => {
      const h = r.headword.toLowerCase();
      return h === lower ? 0 : h.startsWith(lower) ? 1 : h.includes(lower) ? 2 : 3;
    };
    const results = rows
      .sort((a, b) => rank(a) - rank(b) || a.headword.localeCompare(b.headword))
      .slice(0, 20)
      .map(toItem);
    return { query: term, results };
  }

  // ───────────── Helpers ─────────────

  private baseWhere(userId: string, query: ItemListQuery): Prisma.LearningItemWhereInput {
    const lessonFilter: Prisma.LearningItemSourceWhereInput | undefined = query.lessonId
      ? { lessonId: query.lessonId }
      : query.unitId
        ? { lesson: { unitId: query.unitId } }
        : query.bookId
          ? { lesson: { unit: { bookId: query.bookId } } }
          : undefined;

    return {
      ownerId: userId,
      archivedAt: null,
      ...(lessonFilter ? { sources: { some: lessonFilter } } : {}),
      ...(query.q ? this.textFilter(query.q) : {}),
    };
  }

  private textFilter(term: string): Prisma.LearningItemWhereInput {
    return {
      OR: [
        { headword: { contains: term, mode: 'insensitive' } },
        { meaningEn: { contains: term, mode: 'insensitive' } },
        { meaningFa: { contains: term } },
      ],
    };
  }

  private cleanPayload(type: ItemType, payload: unknown): Prisma.InputJsonObject {
    const parsed = parseItemPayload(type, payload);
    if (!parsed.success) {
      throw new DomainError(
        'VALIDATION_FAILED',
        400,
        'Some fields are invalid.',
        parsed.error.issues.map((i) => ({ path: ['payload', ...i.path].join('.'), message: i.message })),
      );
    }
    return parsed.data as Prisma.InputJsonObject;
  }

  /** A learner may only link items to lessons of their own books. */
  private async assertLessonsOwned(userId: string, lessonIds: string[]): Promise<void> {
    if (lessonIds.length === 0) return;
    const unique = [...new Set(lessonIds)];
    const count = await this.prisma.lesson.count({
      where: { id: { in: unique }, unit: { book: { ownerId: userId } } },
    });
    if (count !== unique.length) throw notFound('One of the selected lessons was not found.');
  }
}
