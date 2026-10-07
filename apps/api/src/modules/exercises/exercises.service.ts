import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  FORMAT_SPECS,
  ITEM_TYPE_META,
  type ClientExercise,
  type ExerciseFormat,
  type ExerciseOrigin,
  type PracticeRequest,
  type PracticeRun,
} from '@coach/contracts';
import {
  chooseExercise,
  generateMatching,
  generateTemplates,
  levelForHistory,
  oneLevelUp,
  shuffle,
  type ExerciseDraft,
  type ItemInput,
} from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type Exercise, type ExerciseItem } from '../../generated/prisma/client.js';
import { ExerciseGeneratorService } from '../ai/exercise-generator.service.js';

const fingerprintOf = (key: string): string => createHash('sha256').update(key).digest('hex');

type ExerciseWithItems = Exercise & { items: (ExerciseItem & { item: { id: string; headword: string } })[] };

const withItems = { items: { include: { item: { select: { id: true, headword: true } } } } } as const;

interface ItemStats {
  correct: number;
  last: Date | null;
}

const RECENT_EXERCISE_WINDOW_MS = 24 * 60 * 60 * 1000;

function toClient(e: ExerciseWithItems): ClientExercise {
  return {
    id: e.id,
    format: e.format as ExerciseFormat,
    level: e.level,
    skill: e.skill as ClientExercise['skill'],
    origin: e.origin,
    content: e.content,
    items: e.items.map((i) => ({ id: i.item.id, headword: i.item.headword })),
    estimatedSeconds: e.estimatedSeconds,
  };
}

const toInput = (i: {
  id: string;
  type: ItemInput['type'];
  headword: string;
  meaningEn: string | null;
  meaningFa: string | null;
  payload: Prisma.JsonValue;
}): ItemInput => ({
  id: i.id,
  type: i.type,
  headword: i.headword,
  meaningEn: i.meaningEn,
  meaningFa: i.meaningFa,
  payload: (i.payload ?? {}) as Record<string, unknown>,
});

const itemSelect = {
  id: true,
  type: true,
  headword: true,
  meaningEn: true,
  meaningFa: true,
  payload: true,
} as const;

@Injectable()
export class ExercisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: ExerciseGeneratorService,
  ) {}

  /**
   * Builds a practice run: picks the items that need attention most, and for each one an exercise
   * at a level that fits how well it is known. Solutions never leave the server.
   */
  async buildPractice(userId: string, request: PracticeRequest): Promise<PracticeRun> {
    const scope = await this.resolveScope(userId, request);
    const candidates = await this.prisma.learningItem.findMany({
      where: scope.where,
      select: itemSelect,
      take: 300,
    });
    if (candidates.length === 0) return { exercises: [], scopeLabel: scope.label, itemCount: 0 };

    const stats = await this.itemStats(userId, candidates.map((c) => c.id));
    const ranked = this.rankByNeed(candidates.map(toInput), stats);
    let chosen = ranked.slice(0, request.count);

    // Everything the learner owns is a source of wrong options for multiple choice.
    const library = (await this.prisma.learningItem.findMany({
      where: { ownerId: userId, archivedAt: null },
      select: itemSelect,
      take: 500,
    })).map(toInput);

    const levelOf = (id: string) => levelForHistory(stats.get(id)?.correct ?? 0);
    const matchingSet = chosen.filter((i) => levelOf(i.id) === 'RECOGNITION' && i.meaningFa?.trim()).slice(0, 5);
    const matching = request.count >= 6 ? generateMatching(matchingSet) : null;
    if (matching) {
      // One matching exercise stands in for several items. Bring in others so the run keeps its length.
      const taken = new Set(chosen.map((i) => i.id));
      chosen = [...chosen, ...ranked.filter((i) => !taken.has(i.id)).slice(0, matchingSet.length - 1)];
    }

    await this.save(userId, chosen.flatMap((i) => generateTemplates(i, library)), 'TEMPLATE');
    if (matching) await this.save(userId, [matching], 'TEMPLATE');

    const pool = await this.poolFor(userId, chosen.map((i) => i.id));
    const recent = await this.recentExerciseIds(userId);
    const rng = Math.random;

    const picked: ExerciseWithItems[] = [];
    const usedIds = new Set<string>();
    const recentFormats: ExerciseFormat[] = [];
    const inMatching = new Set(matching ? matchingSet.map((i) => i.id) : []);

    // One exercise per item first; if the scope is small, go round again with different exercises.
    const solo = chosen.filter((i) => !inMatching.has(i.id));
    const target = request.count - (matching ? 1 : 0);
    for (let slot = 0; picked.length < target && slot < solo.length * 3; slot++) {
      const item = solo[slot % solo.length]!;
      const available = (pool.get(item.id) ?? []).filter((e) => !usedIds.has(e.id));
      const choice = chooseExercise(
        available.map((e) => ({ level: e.level, format: e.format as ExerciseFormat, e })),
        levelOf(item.id),
        recentFormats.slice(-2),
        rng,
        oneLevelUp(levelOf(item.id)),
        (c) => recent.has(c.e.id),
      );      if (!choice) continue;
      picked.push(choice.e);
      usedIds.add(choice.e.id);
      recentFormats.push(choice.format);
    }
    if (matching) {
      const row = await this.prisma.exercise.findUnique({
        where: { ownerId_fingerprint: { ownerId: userId, fingerprint: fingerprintOf(matching.key) } },
        include: withItems,
      });
      // Matching goes second: a gentle warm-up after the first question.
      if (row && row.status === 'ACTIVE') picked.splice(Math.min(1, picked.length), 0, row);
    }

    return {
      exercises: picked.map(toClient),
      scopeLabel: scope.label,
      itemCount: new Set(picked.flatMap((p) => p.items.map((i) => i.itemId))).size,
    };
  }

  /** Asks the AI for extra exercises for one item. They join the same pool as the built-in ones. */
  async generateForItem(userId: string, itemId: string): Promise<{ created: number; rejected: number }> {
    const item = await this.prisma.learningItem.findFirst({
      where: { id: itemId, ownerId: userId, archivedAt: null },
      select: itemSelect,
    });
    if (!item) throw notFound('Item not found.');

    const input = toInput(item);
    const { drafts, rejected, runId } = await this.generator.generate(userId, input);
    const created = await this.save(userId, drafts, 'AI_GENERATED', runId);
    if (drafts.length > 0 && created === 0) {
      throw new DomainError('CONFLICT', 409, 'These exercises already exist. Try again for new ones.');
    }
    return { created, rejected: rejected.length };
  }

  // ───────────── Pool ─────────────

  /** Stores drafts that are not stored yet. Returns how many were new. */
  private async save(userId: string, drafts: ExerciseDraft[], origin: ExerciseOrigin, aiRunId?: string): Promise<number> {
    if (drafts.length === 0) return 0;
    const fingerprints = drafts.map((d) => fingerprintOf(d.key));
    const existing = await this.prisma.exercise.findMany({
      where: { ownerId: userId, fingerprint: { in: fingerprints } },
      select: { fingerprint: true },
    });
    const have = new Set(existing.map((e) => e.fingerprint));
    let created = 0;

    for (const [index, draft] of drafts.entries()) {
      const fingerprint = fingerprints[index]!;
      if (have.has(fingerprint)) continue;
      have.add(fingerprint);
      const spec = FORMAT_SPECS[draft.format];
      try {
        await this.prisma.exercise.create({
          data: {
            ownerId: userId,
            format: draft.format,
            level: draft.level,
            skill: draft.skill,
            origin,
            content: draft.content as Prisma.InputJsonValue,
            solution: draft.solution as Prisma.InputJsonValue,
            evaluationMode: spec.evaluation,
            estimatedSeconds: spec.estimatedSeconds,
            fingerprint,
            aiRunId,
            items: {
              create: draft.itemIds.map((itemId, i) => ({
                itemId,
                // A matching exercise belongs to no single item, so it is never picked for one.
                isPrimary: draft.format === 'matching' ? false : i === 0,
              })),
            },
          },
        });
        created++;
      } catch (error) {
        // Another request stored the same exercise a moment ago: fine.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return created;
  }

  private async poolFor(userId: string, itemIds: string[]): Promise<Map<string, ExerciseWithItems[]>> {
    const rows = await this.prisma.exercise.findMany({
      where: { ownerId: userId, status: 'ACTIVE', items: { some: { itemId: { in: itemIds }, isPrimary: true } } },
      include: withItems,
    });
    const pool = new Map<string, ExerciseWithItems[]>();
    for (const row of rows) {
      for (const link of row.items) {
        if (!link.isPrimary || !itemIds.includes(link.itemId)) continue;
        pool.set(link.itemId, [...(pool.get(link.itemId) ?? []), row]);
      }
    }
    return pool;
  }

  // ───────────── Selection helpers ─────────────

  private async resolveScope(
    userId: string,
    request: PracticeRequest,
  ): Promise<{ where: Prisma.LearningItemWhereInput; label: string }> {
    const base = { ownerId: userId, archivedAt: null } satisfies Prisma.LearningItemWhereInput;

    if (request.scope === 'current') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
        orderBy: { activatedAt: 'desc' },
        include: { currentLesson: true },
      });
      const lesson = enrollment?.currentLesson;
      if (lesson) {
        return {
          where: { ...base, sources: { some: { lessonId: lesson.id } } },
          label: `${lesson.code} · ${lesson.title}`,
        };
      }
      return { where: base, label: 'Your library' };
    }
    if (request.scope === 'lesson') {
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: request.lessonId!, unit: { book: { ownerId: userId } } },
      });
      if (!lesson) throw notFound('Lesson not found.');
      return { where: { ...base, sources: { some: { lessonId: lesson.id } } }, label: `${lesson.code} · ${lesson.title}` };
    }
    if (request.scope === 'type') {
      return { where: { ...base, type: request.type! }, label: ITEM_TYPE_META[request.type!].plural };
    }
    if (request.scope === 'item') {
      const item = await this.prisma.learningItem.findFirst({ where: { ...base, id: request.itemId! }, select: { headword: true } });
      if (!item) throw notFound('Item not found.');
      return { where: { ...base, id: request.itemId! }, label: item.headword };
    }
    return { where: base, label: 'Your whole library' };
  }

  /** Items never practised first, then the ones practised longest ago. Ties are shuffled. */
  private rankByNeed(items: ItemInput[], stats: Map<string, ItemStats>): ItemInput[] {
    const shuffled = shuffle(items, Math.random);
    return shuffled.sort((a, b) => {
      const la = stats.get(a.id)?.last?.getTime() ?? 0;
      const lb = stats.get(b.id)?.last?.getTime() ?? 0;
      return la - lb;
    });
  }

  private async itemStats(userId: string, itemIds: string[]): Promise<Map<string, ItemStats>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ itemId: string; correct: bigint; last: Date }[]>`
      SELECT r."itemId" AS "itemId",
             COUNT(*) FILTER (WHERE r."isCorrect") AS correct,
             MAX(a."createdAt") AS last
      FROM "AttemptItemResult" r
      JOIN "ExerciseAttempt" a ON a.id = r."attemptId"
      WHERE a."userId" = ${userId}::uuid AND r."itemId" = ANY(${itemIds}::uuid[])
      GROUP BY r."itemId"`;
    return new Map(rows.map((r) => [r.itemId, { correct: Number(r.correct), last: r.last }]));
  }

  private async recentExerciseIds(userId: string): Promise<Set<string>> {
    const since = new Date(Date.now() - RECENT_EXERCISE_WINDOW_MS);
    const rows = await this.prisma.exerciseAttempt.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { exerciseId: true },
      take: 200,
    });
    return new Set(rows.map((r) => r.exerciseId));
  }
}
