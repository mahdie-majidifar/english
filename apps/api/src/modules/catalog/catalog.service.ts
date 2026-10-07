import { Injectable } from '@nestjs/common';
import { parseStructureText } from '@coach/domain';
import type {
  BookDetail,
  BookSummary,
  CreateBook,
  CreateLesson,
  CreateUnit,
  CurrentContext,
  ImportStructureResult,
  UpdateBook,
  UpdateLesson,
  UpdateUnit,
} from '@coach/contracts';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';

const conflict = (detail: string) => new DomainError('CONFLICT', 409, detail);

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Books ─────────────

  async listBooks(userId: string): Promise<BookSummary[]> {
    const [books, current, itemCounts] = await Promise.all([
      this.prisma.book.findMany({
        where: { ownerId: userId },
        include: { units: { include: { _count: { select: { lessons: true } } } } },
        orderBy: [{ series: 'asc' }, { levelNumber: 'asc' }, { createdAt: 'asc' }],
      }),
      this.currentBookId(userId),
      this.itemCountsByBook(userId),
    ]);

    return books.map((book) => ({
      id: book.id,
      series: book.series,
      title: book.title,
      levelNumber: book.levelNumber,
      cefr: book.cefr,
      unitCount: book.units.length,
      lessonCount: book.units.reduce((sum, u) => sum + u._count.lessons, 0),
      itemCount: itemCounts.get(book.id) ?? 0,
      isCurrent: book.id === current,
    }));
  }

  async getBook(userId: string, bookId: string): Promise<BookDetail> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId: userId },
      include: {
        units: { orderBy: { number: 'asc' }, include: { lessons: { orderBy: { code: 'asc' } } } },
      },
    });
    if (!book) throw notFound('Book not found.');

    const lessonIds = book.units.flatMap((u) => u.lessons.map((l) => l.id));
    const [counts, enrollment, itemCounts] = await Promise.all([
      this.itemCountsByLesson(userId, lessonIds),
      this.prisma.enrollment.findUnique({
        where: { userId_bookId: { userId, bookId } },
        select: { currentLessonId: true },
      }),
      this.itemCountsByBook(userId),
    ]);
    const current = await this.currentBookId(userId);

    return {
      id: book.id,
      series: book.series,
      title: book.title,
      levelNumber: book.levelNumber,
      cefr: book.cefr,
      itemCount: itemCounts.get(book.id) ?? 0,
      isCurrent: current === book.id,
      units: book.units.map((unit) => ({
        id: unit.id,
        number: unit.number,
        title: unit.title,
        lessons: unit.lessons.map((lesson) => ({
          id: lesson.id,
          code: lesson.code,
          title: lesson.title,
          itemCount: counts.get(lesson.id) ?? 0,
          isCurrent: enrollment?.currentLessonId === lesson.id,
        })),
      })),
    };
  }

  async createBook(userId: string, dto: CreateBook): Promise<BookSummary> {
    const book = await this.prisma.book.create({
      data: {
        ownerId: userId,
        series: dto.series,
        title: dto.title,
        levelNumber: dto.levelNumber ?? null,
        cefr: dto.cefr ?? null,
      },
    });
    return {
      id: book.id,
      series: book.series,
      title: book.title,
      levelNumber: book.levelNumber,
      cefr: book.cefr,
      unitCount: 0,
      lessonCount: 0,
      itemCount: 0,
      isCurrent: false,
    };
  }

  async updateBook(userId: string, bookId: string, dto: UpdateBook): Promise<void> {
    await this.assertBookOwned(userId, bookId);
    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        ...(dto.series !== undefined ? { series: dto.series } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.levelNumber !== undefined ? { levelNumber: dto.levelNumber } : {}),
        ...(dto.cefr !== undefined ? { cefr: dto.cefr } : {}),
      },
    });
  }

  async deleteBook(userId: string, bookId: string): Promise<void> {
    await this.assertBookOwned(userId, bookId);
    // Units, lessons and enrollments cascade. Learning items survive: they just lose the lesson link.
    await this.prisma.book.delete({ where: { id: bookId } });
  }

  // ───────────── Units ─────────────

  async createUnit(userId: string, bookId: string, dto: CreateUnit): Promise<{ id: string }> {
    await this.assertBookOwned(userId, bookId);
    try {
      const unit = await this.prisma.unit.create({
        data: { bookId, number: dto.number, title: dto.title ?? null },
      });
      return { id: unit.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(`Unit ${dto.number} already exists in this book.`);
      throw error;
    }
  }

  async updateUnit(userId: string, unitId: string, dto: UpdateUnit): Promise<void> {
    await this.assertUnitOwned(userId, unitId);
    try {
      await this.prisma.unit.update({
        where: { id: unitId },
        data: {
          ...(dto.number !== undefined ? { number: dto.number } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Another unit already has that number.');
      throw error;
    }
  }

  async deleteUnit(userId: string, unitId: string): Promise<void> {
    await this.assertUnitOwned(userId, unitId);
    await this.prisma.unit.delete({ where: { id: unitId } });
  }

  // ───────────── Lessons ─────────────

  async createLesson(userId: string, unitId: string, dto: CreateLesson): Promise<{ id: string }> {
    await this.assertUnitOwned(userId, unitId);
    try {
      const lesson = await this.prisma.lesson.create({
        data: { unitId, code: dto.code.toUpperCase(), title: dto.title },
      });
      return { id: lesson.id };
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(`Lesson ${dto.code} already exists in this unit.`);
      throw error;
    }
  }

  async updateLesson(userId: string, lessonId: string, dto: UpdateLesson): Promise<void> {
    await this.assertLessonOwned(userId, lessonId);
    try {
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: {
          ...(dto.code !== undefined ? { code: dto.code.toUpperCase() } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Another lesson in this unit has that code.');
      throw error;
    }
  }

  async deleteLesson(userId: string, lessonId: string): Promise<void> {
    await this.assertLessonOwned(userId, lessonId);
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ───────────── Bulk structure import ─────────────

  async importStructure(userId: string, bookId: string, text: string): Promise<ImportStructureResult> {
    await this.assertBookOwned(userId, bookId);
    const parsed = parseStructureText(text);

    return this.prisma.$transaction(async (tx) => {
      const existingUnits = await tx.unit.findMany({
        where: { bookId },
        include: { lessons: { select: { code: true } } },
      });
      const unitIds = new Map(existingUnits.map((u) => [u.number, u.id]));
      const knownLessons = new Map(
        existingUnits.map((u) => [u.number, new Set(u.lessons.map((l) => l.code))]),
      );

      let unitsCreated = 0;
      let lessonsCreated = 0;
      let lessonsSkipped = 0;

      for (const unit of parsed.units) {
        const existingId = unitIds.get(unit.number);
        if (existingId) {
          // Fill in a missing title, never overwrite one the learner already set.
          if (unit.title) {
            await tx.unit.updateMany({
              where: { id: existingId, title: null },
              data: { title: unit.title },
            });
          }
          continue;
        }
        const created = await tx.unit.create({
          data: { bookId, number: unit.number, title: unit.title },
        });
        unitIds.set(unit.number, created.id);
        knownLessons.set(unit.number, new Set());
        unitsCreated++;
      }

      for (const lesson of parsed.lessons) {
        const unitId = unitIds.get(lesson.unitNumber)!;
        const codes = knownLessons.get(lesson.unitNumber)!;
        if (codes.has(lesson.code)) {
          lessonsSkipped++;
          continue;
        }
        await tx.lesson.create({ data: { unitId, code: lesson.code, title: lesson.title } });
        codes.add(lesson.code);
        lessonsCreated++;
      }

      return { unitsCreated, lessonsCreated, lessonsSkipped, rejected: parsed.rejected };
    });
  }

  // ───────────── Current lesson ─────────────

  async setCurrentLesson(userId: string, lessonId: string): Promise<CurrentContext> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, unit: { book: { ownerId: userId } } },
      include: { unit: true },
    });
    if (!lesson) throw notFound('Lesson not found.');

    await this.prisma.enrollment.upsert({
      where: { userId_bookId: { userId, bookId: lesson.unit.bookId } },
      create: {
        userId,
        bookId: lesson.unit.bookId,
        currentLessonId: lesson.id,
      },
      update: { currentLessonId: lesson.id, status: 'ACTIVE', activatedAt: new Date() },
    });

    const current = await this.getCurrent(userId);
    return current!;
  }

  async getCurrent(userId: string): Promise<CurrentContext | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
      orderBy: { activatedAt: 'desc' },
      include: { book: true, currentLesson: { include: { unit: true } } },
    });
    const lesson = enrollment?.currentLesson;
    if (!enrollment || !lesson) return null;

    const counts = await this.itemCountsByLesson(userId, [lesson.id]);
    return {
      book: { id: enrollment.book.id, title: enrollment.book.title },
      unit: { id: lesson.unit.id, number: lesson.unit.number, title: lesson.unit.title },
      lesson: { id: lesson.id, code: lesson.code, title: lesson.title },
      itemCount: counts.get(lesson.id) ?? 0,
    };
  }

  // ───────────── Helpers ─────────────

  private async currentBookId(userId: string): Promise<string | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
      orderBy: { activatedAt: 'desc' },
      select: { bookId: true },
    });
    return enrollment?.bookId ?? null;
  }

  private async itemCountsByLesson(userId: string, lessonIds: string[]): Promise<Map<string, number>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await this.prisma.learningItemSource.groupBy({
      by: ['lessonId'],
      where: { lessonId: { in: lessonIds }, item: { ownerId: userId, archivedAt: null } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((r) => (r.lessonId ? [[r.lessonId, r._count._all] as const] : [])));
  }

  /** Distinct items per book (an item met in two lessons still counts once). */
  private async itemCountsByBook(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ bookId: string; n: bigint }[]>`
      SELECT u."bookId" AS "bookId", COUNT(DISTINCT s."itemId") AS n
      FROM "LearningItemSource" s
      JOIN "Lesson" l ON l.id = s."lessonId"
      JOIN "Unit" u ON u.id = l."unitId"
      JOIN "LearningItem" i ON i.id = s."itemId"
      WHERE i."ownerId" = ${userId}::uuid AND i."archivedAt" IS NULL
      GROUP BY u."bookId"`;
    return new Map(rows.map((r) => [r.bookId, Number(r.n)]));
  }

  private async assertBookOwned(userId: string, bookId: string): Promise<void> {
    const found = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId: userId },
      select: { id: true },
    });
    if (!found) throw notFound('Book not found.');
  }

  private async assertUnitOwned(userId: string, unitId: string): Promise<void> {
    const found = await this.prisma.unit.findFirst({
      where: { id: unitId, book: { ownerId: userId } },
      select: { id: true },
    });
    if (!found) throw notFound('Unit not found.');
  }

  private async assertLessonOwned(userId: string, lessonId: string): Promise<void> {
    const found = await this.prisma.lesson.findFirst({
      where: { id: lessonId, unit: { book: { ownerId: userId } } },
      select: { id: true },
    });
    if (!found) throw notFound('Lesson not found.');
  }
}
