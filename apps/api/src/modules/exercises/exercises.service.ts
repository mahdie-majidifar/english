import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  FORMAT_SPECS,
  ITEM_TYPE_META,
  type ClientExercise,
  type ExerciseFormat,
  type ExerciseLevel,
  type ExerciseOrigin,
  type PracticeRequest,
  type PracticeRun,
} from '@coach/contracts';
import {
  DEFAULT_WEIGHTS,
  chooseExercise,
  generateMatching,
  generateTemplates,
  oneLevelUp,
  scoreItem,
  shuffle,
  toLocalDate,
  usableExercises,
  type ExerciseDraft,
  type ItemInput,
  type PlannerItem,
} from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type Exercise, type ExerciseItem } from '../../generated/prisma/client.js';
import { ExerciseGeneratorService } from '../ai/exercise-generator.service.js';
import { LearningService, toPlannerState } from '../learning/learning.service.js';

export const fingerprintOf = (key: string): string => createHash('sha256').update(key).digest('hex');

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export type ExerciseWithItems = Exercise & { items: (ExerciseItem & { item: { id: string; headword: string } })[] };

export const withItems = { items: { include: { item: { select: { id: true, headword: true } } } } } as const;

const RECENT_EXERCISE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function toClient(e: ExerciseWithItems): ClientExercise {
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

export const toInput = (i: {
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

export const itemSelect = {
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
    private readonly learning: LearningService,
  ) {}

  /**
   * Builds a practice run: picks the items that need attention most, and for each one an exercise
   * at the level the learner has reached with it. Solutions never leave the server.
   */
  async buildPractice(userId: string, request: PracticeRequest): Promise<PracticeRun> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const now = new Date();
    const localDate = toLocalDate(now, user.timezone);

    const scope = await this.resolveScope(userId, request, now);
    const candidates = await this.prisma.learningItem.findMany({ where: scope.where, select: itemSelect, take: 300 });
    if (candidates.length === 0) return { exercises: [], scopeLabel: scope.label, itemCount: 0 };

    const context = await this.learning.contextFor(userId, candidates.map((c) => c.id), now, localDate);
    const rules = await this.learning.difficultyFor(userId);
    const levelOf = (id: string): ExerciseLevel => context.get(id)?.state?.currentLevel ?? rules.startLevel;

    // The same scoring as the daily session: due reviews, mistakes, weak and new items first.
    const ranked = shuffle(candidates.map(toInput), Math.random)
      .map((item) => {
        const ctx = context.get(item.id)!;
        const planner: PlannerItem = {
          id: item.id,
          state: toPlannerState(ctx.state, now),
          mistakePriority: ctx.mistakePriority,
          inCurrentLesson: false,
          teacherRecency: 0,
          seenToday: false,
          pool: [],
        };
        return { item, score: scoreItem(planner, now, DEFAULT_WEIGHTS).score };
      })
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    let chosen = ranked.slice(0, request.count);
    const matchingSet = chosen.filter((i) => levelOf(i.id) === 'RECOGNITION' && i.meaningFa?.trim()).slice(0, 5);
    const matching = request.count >= 6 ? generateMatching(matchingSet) : null;
    if (matching) {
      // One matching exercise stands in for several items. Bring in others so the run keeps its length.
      const taken = new Set(chosen.map((i) => i.id));
      chosen = [...chosen, ...ranked.filter((i) => !taken.has(i.id)).slice(0, matchingSet.length - 1)];
    }

    await this.ensureTemplatesFor(userId, chosen);
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
      const available = usableExercises(pool.get(item.id) ?? [], rules).filter((e) => !usedIds.has(e.id));
      const choice = chooseExercise(
        available.map((e) => ({ level: e.level, format: e.format as ExerciseFormat, e })),
        levelOf(item.id),
        recentFormats.slice(-2),
        rng,
        oneLevelUp(levelOf(item.id)),
        (c) => recent.has(c.e.id),
      );
      if (!choice) continue;
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

  /** Makes sure the built-in exercises for these items exist. Safe to call repeatedly. */
  async ensureTemplatesFor(userId: string, items: ItemInput[]): Promise<void> {
    if (items.length === 0) return;
    // Everything the learner owns is a source of wrong options for multiple choice.
    const library = (
      await this.prisma.learningItem.findMany({
        where: { ownerId: userId, archivedAt: null },
        select: itemSelect,
        take: 500,
      })
    ).map(toInput);
    await this.save(userId, items.flatMap((i) => generateTemplates(i, library)), 'TEMPLATE');
  }

  /** Stores drafts that are not stored yet. Returns how many were new. */
  private async save(userId: string, drafts: ExerciseDraft[], origin: ExerciseOrigin, aiRunId?: string): Promise<number> {
    if (drafts.length === 0) return 0;
    const fingerprints = drafts.map((d) => fingerprintOf(d.key));
    const existing = await this.prisma.exercise.findMany({
      where: { ownerId: userId, fingerprint: { in: fingerprints } },
      select: { fingerprint: true },
    });
    const have = new Set(existing.map((e) => e.fingerprint));

    // The ids are made here so the exercises and their item links go in as two bulk inserts, not one round trip each.
    // Each gets its own creation time, one millisecond apart, so "oldest first" still means "in the order they were made".
    const fresh: { id: string; draft: ExerciseDraft; fingerprint: string; createdAt: Date }[] = [];
    const startedAt = Date.now();
    for (const [index, draft] of drafts.entries()) {
      const fingerprint = fingerprints[index]!;
      if (have.has(fingerprint)) continue;
      have.add(fingerprint);
      fresh.push({ id: randomUUID(), draft, fingerprint, createdAt: new Date(startedAt + fresh.length) });
    }
    if (fresh.length === 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      const stored = new Set<string>();
      for (const batch of chunk(fresh, 500)) {
        // `skipDuplicates`: another request stored the same exercise a moment ago, which is fine.
        const { count } = await tx.exercise.createMany({
          data: batch.map(({ id, draft, fingerprint, createdAt }) => ({
            id,
            createdAt,
            ownerId: userId,
            format: draft.format,
            level: draft.level,
            skill: draft.skill,
            origin,
            content: draft.content as Prisma.InputJsonValue,
            solution: draft.solution as Prisma.InputJsonValue,
            evaluationMode: FORMAT_SPECS[draft.format].evaluation,
            estimatedSeconds: FORMAT_SPECS[draft.format].estimatedSeconds,
            fingerprint,
            aiRunId,
          })),
          skipDuplicates: true,
        });
        created += count;
        // Which of these ids really went in (a skipped duplicate keeps the other request's exercise and its links).
        const rows = count === batch.length ? batch.map((b) => ({ id: b.id })) : await tx.exercise.findMany({ where: { id: { in: batch.map((b) => b.id) } }, select: { id: true } });
        for (const row of rows) stored.add(row.id);
      }

      const links = fresh
        .filter((f) => stored.has(f.id))
        .flatMap(({ id, draft }) =>
          draft.itemIds.map((itemId, i) => ({
            exerciseId: id,
            itemId,
            // A matching exercise belongs to no single item, so it is never picked for one.
            isPrimary: draft.format === 'matching' ? false : i === 0,
          })),
        );
      for (const batch of chunk(links, 2000)) await tx.exerciseItem.createMany({ data: batch, skipDuplicates: true });
      return created;
    });
  }

  /** Active exercises for each item (the ones where the item is the main subject). */
  async poolFor(userId: string, itemIds: string[]): Promise<Map<string, ExerciseWithItems[]>> {
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

  /** Exercises answered in the last day, so they are not asked again straight away. */
  async recentExerciseIds(userId: string): Promise<Set<string>> {
    const since = new Date(Date.now() - RECENT_EXERCISE_WINDOW_MS);
    const rows = await this.prisma.exerciseAttempt.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { exerciseId: true },
      take: 300,
    });
    return new Set(rows.map((r) => r.exerciseId));
  }

  // ───────────── Scope ─────────────

  private async resolveScope(
    userId: string,
    request: PracticeRequest,
    now: Date,
  ): Promise<{ where: Prisma.LearningItemWhereInput; label: string }> {
    const base = { ownerId: userId, archivedAt: null } satisfies Prisma.LearningItemWhereInput;

    switch (request.scope) {
      case 'current': {
        const enrollment = await this.prisma.enrollment.findFirst({
          where: { userId, status: 'ACTIVE', currentLessonId: { not: null } },
          orderBy: { activatedAt: 'desc' },
          include: { currentLesson: true },
        });
        const lesson = enrollment?.currentLesson;
        if (lesson) {
          return { where: { ...base, sources: { some: { lessonId: lesson.id } } }, label: `${lesson.code} · ${lesson.title}` };
        }
        return { where: base, label: 'Your library' };
      }
      case 'lesson': {
        const lesson = await this.prisma.lesson.findFirst({
          where: { id: request.lessonId!, unit: { book: { ownerId: userId } } },
        });
        if (!lesson) throw notFound('Lesson not found.');
        return { where: { ...base, sources: { some: { lessonId: lesson.id } } }, label: `${lesson.code} · ${lesson.title}` };
      }
      case 'unit': {
        const unit = await this.prisma.unit.findFirst({
          where: { id: request.unitId!, book: { ownerId: userId } },
        });
        if (!unit) throw notFound('Unit not found.');
        return {
          where: { ...base, sources: { some: { lesson: { unitId: unit.id } } } },
          label: unit.title ? `Unit ${unit.number} · ${unit.title}` : `Unit ${unit.number}`,
        };
      }
      case 'type':
        return { where: { ...base, type: request.type! }, label: ITEM_TYPE_META[request.type!].plural };
      case 'item': {
        const item = await this.prisma.learningItem.findFirst({ where: { ...base, id: request.itemId! }, select: { headword: true } });
        if (!item) throw notFound('Item not found.');
        return { where: { ...base, id: request.itemId! }, label: item.headword };
      }
      case 'due':
        return {
          where: { ...base, userStates: { some: { userId, status: { not: 'NEW' }, due: { lte: now } } } },
          label: 'Due for review',
        };
      case 'mistakes':
        return {
          where: { ...base, mistakes: { some: { userId, status: { in: ['ACTIVE', 'IMPROVING'] } } } },
          label: 'My mistakes',
        };
      case 'weak':
        return { where: { ...base, userStates: { some: { userId, isWeak: true } } }, label: 'Weak items' };
      default:
        return { where: base, label: 'Your whole library' };
    }
  }
}
