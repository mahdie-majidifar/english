import { Injectable } from '@nestjs/common';
import { isPlaceholderLessonTitle, normalizeKey } from '@coach/domain';
import {
  ExplanationSchema,
  type ExplanationResponse,
  type LearnContextDto,
  type LearnContextQuery,
  type SuggestFocus,
  type SuggestLessonContent,
  type SuggestLessonContentResult,
} from '@coach/contracts';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { LearningContentService } from '../ai/learning-content.service.js';

/** How a book's level reads to the AI. Only what is certain from the series and level number. */
function levelHint(book: { series: string; levelNumber: number | null; cefr: string | null }): string {
  if (book.cefr) return book.cefr;
  if (book.series === 'American English File') {
    if (book.levelNumber === 3) return 'B1-B2 (intermediate)';
    if (book.levelNumber === 4) return 'B2 (upper-intermediate)';
    if (book.levelNumber === 5) return 'C1 (advanced)';
  }
  return 'B1-B2';
}

const today = () => new Date().toISOString().slice(0, 10);

/** Details saved on an item, as plain text the AI can read. Capped, so one odd item cannot bloat a request. */
function describePayload(payload: Prisma.JsonValue): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const { examples: _examples, ...rest } = payload as Record<string, unknown>;
  const text = JSON.stringify(rest);
  return text === '{}' ? '' : text.slice(0, 1200);
}

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: LearningContentService,
  ) {}

  /** What a lesson or unit is called, and how much is in it, for the top of the Learn screen. */
  async context(userId: string, query: LearnContextQuery): Promise<LearnContextDto> {
    if (query.lessonId) {
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: query.lessonId, unit: { book: { ownerId: userId } } },
        include: { unit: { include: { book: true } } },
      });
      if (!lesson) throw notFound('Lesson not found.');
      const itemCount = await this.prisma.learningItem.count({
        where: { ownerId: userId, archivedAt: null, sources: { some: { lessonId: lesson.id } } },
      });
      return {
        kind: 'lesson',
        title: `${lesson.code} · ${lesson.title}`,
        subtitle: lesson.unit.book.title,
        bookId: lesson.unit.book.id,
        lessonId: lesson.id,
        unitId: lesson.unit.id,
        itemCount,
        needsTopic: isPlaceholderLessonTitle(lesson.title) && !lesson.unit.title,
      };
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: query.unitId, book: { ownerId: userId } },
      include: { book: true },
    });
    if (!unit) throw notFound('Unit not found.');
    const itemCount = await this.prisma.learningItem.count({
      where: { ownerId: userId, archivedAt: null, sources: { some: { lesson: { unitId: unit.id } } } },
    });
    return {
      kind: 'unit',
      title: unit.title ? `Unit ${unit.number} · ${unit.title}` : `Unit ${unit.number}`,
      subtitle: unit.book.title,
      bookId: unit.book.id,
      lessonId: null,
      unitId: unit.id,
      itemCount,
      needsTopic: false,
    };
  }

  /** The saved mini-lesson for an item, if the learner already asked for one. */
  async getExplanation(userId: string, itemId: string): Promise<ExplanationResponse> {
    await this.requireItem(userId, itemId);
    const row = await this.prisma.itemExplanation.findUnique({ where: { itemId } });
    return { explanation: row ? ExplanationSchema.parse(row.content) : null };
  }

  /** Writes a mini-lesson about an item with the AI and keeps it. Asking again returns the kept one. */
  async explain(userId: string, itemId: string, refresh: boolean): Promise<ExplanationResponse> {
    const item = await this.requireItem(userId, itemId);
    if (!refresh) {
      const kept = await this.prisma.itemExplanation.findUnique({ where: { itemId } });
      if (kept) return { explanation: ExplanationSchema.parse(kept.content) };
    }

    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const { explanation, runId } = await this.content.explain(userId, {
      type: item.type,
      headword: item.headword,
      meaningEn: item.meaningEn,
      meaningFa: item.meaningFa,
      examples: Array.isArray(payload['examples']) ? (payload['examples'] as string[]) : [],
      details: describePayload(item.payload),
    });
    const content = explanation as unknown as Prisma.InputJsonValue;
    await this.prisma.itemExplanation.upsert({
      where: { itemId },
      create: { itemId, content, aiRunId: runId },
      update: { content, aiRunId: runId, createdAt: new Date() },
    });
    return { explanation };
  }

  /**
   * Asks the AI for starter items for a lesson and parks them for review, exactly like teacher notes:
   * nothing reaches the library until the learner has looked at it and confirmed.
   */
  async suggestForLesson(userId: string, lessonId: string, request: SuggestLessonContent): Promise<SuggestLessonContentResult> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, unit: { book: { ownerId: userId } } },
      include: { unit: { include: { book: true } } },
    });
    if (!lesson) throw notFound('Lesson not found.');

    // The AI needs a topic. A lesson that still has a neutral name has none, so the learner must say what it is about.
    const named = !isPlaceholderLessonTitle(lesson.title);
    const unitTitle = lesson.unit.title?.trim();
    const topic = request.topic ?? (named ? lesson.title : unitTitle);
    if (!topic) {
      throw new DomainError(
        'VALIDATION_FAILED',
        400,
        'Tell the AI what this lesson is about, or name the lesson first (Paste contents on the book page).',
        [{ path: 'topic', message: 'What is this lesson about?' }],
      );
    }

    const existing = await this.prisma.learningItem.findMany({
      where: { ownerId: userId, archivedAt: null, sources: { some: { lessonId } } },
      select: { headword: true },
      take: 200,
    });

    const { proposal, runId } = await this.content.suggest(userId, {
      book: lesson.unit.book.title,
      level: levelHint(lesson.unit.book),
      unit: unitTitle ? `Unit ${lesson.unit.number}: ${unitTitle}` : `Unit ${lesson.unit.number}`,
      topic,
      focus: request.focus as SuggestFocus,
      existing: existing.map((e) => e.headword),
    });

    // Drop anything the lesson already has; a word the learner owns elsewhere is flagged by the review screen.
    const have = new Set(existing.map((e) => normalizeKey(e.headword)));
    const items = proposal.items.filter((i) => !have.has(normalizeKey(i.headword)));
    if (items.length === 0) {
      throw new DomainError('CONFLICT', 409, 'The AI had nothing new to suggest for this lesson.');
    }

    const label = `${lesson.code ? `${lesson.code} ` : ''}${named ? lesson.title : topic}`.trim();
    const session = await this.prisma.teacherSession.create({
      data: {
        userId,
        title: `AI suggestions · ${label}`,
        classDate: new Date(`${today()}T00:00:00Z`),
        lessonId,
      },
    });
    const material = await this.prisma.teacherMaterial.create({
      data: {
        userId,
        sessionId: session.id,
        category: 'CLASS_NOTES',
        title: `AI suggestions for ${label}`,
        rawText: `Suggested by the AI for ${lesson.unit.book.title}, unit ${lesson.unit.number}, topic "${topic}". This is not your teacher's text: look through it and keep only what is useful.`,
        status: 'AWAITING_REVIEW',
        proposal: { ...proposal, items } as unknown as Prisma.InputJsonValue,
        aiRunId: runId,
      },
    });
    return { materialId: material.id, itemCount: items.length };
  }

  private async requireItem(userId: string, itemId: string) {
    const item = await this.prisma.learningItem.findFirst({ where: { id: itemId, ownerId: userId, archivedAt: null } });
    if (!item) throw notFound('Item not found.');
    return item;
  }
}
