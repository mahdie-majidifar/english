import { Injectable } from '@nestjs/common';
import type { ErrorTypeCode, Evaluation, ExerciseFormat, ExerciseLevel, ItemUpdate, Verdict } from '@coach/contracts';
import {
  adaptLevel,
  afterCorrect,
  afterError,
  computeMastery,
  decayPriority,
  describeResponse,
  isWeakItem,
  mistakePriority,
  mistakeSignature,
  ratingFor,
  retrievability,
  reviewCard,
  severityOf,
  statusFor,
  SERIOUS_PRIORITY,
  updateAccuracy,
  type PlannerItem,
  type SrsState,
} from '@coach/domain';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma, UserItemState } from '../../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const dateOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);

export const srsFrom = (row: UserItemState): SrsState => ({
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  fsrsState: row.fsrsState,
  reps: row.reps,
  lapses: row.lapses,
  scheduledDays: row.scheduledDays,
  lastReviewedAt: row.lastReviewedAt,
  learningSteps: row.learningSteps,
});

export interface ItemContext {
  /** Null until the learner first answers something about the item. */
  state: UserItemState | null;
  /** Highest open-mistake priority, faded by how long ago it was made. 0 when there are none. */
  mistakePriority: number;
  seenToday: boolean;
}

export const toPlannerState = (row: UserItemState | null, now: Date): PlannerItem['state'] =>
  row
    ? {
        status: row.status,
        due: row.due,
        retrievability: retrievability(srsFrom(row), now),
        mastery: row.mastery,
        isWeak: row.isWeak,
        currentLevel: row.currentLevel,
      }
    : null;

export interface ApplyAttemptInput {
  userId: string;
  now: Date;
  /** The learner's own calendar day, YYYY-MM-DD. */
  localDate: string;
  attemptId: string;
  format: ExerciseFormat;
  level: ExerciseLevel;
  estimatedSeconds: number;
  content: unknown;
  response: unknown;
  evaluation: Pick<Evaluation, 'verdict' | 'correctAnswerText'>;
  hintsUsed: number;
  durationMs?: number | null;
  /** One entry per item the exercise covers. */
  items: { itemId: string; isCorrect: boolean; score: number; errorCodes: string[] }[];
}

export interface AttemptLearning {
  itemUpdates: ItemUpdate[];
  mistakesResolved: number;
}

/**
 * What an answer teaches the system: when to review the item next, how well it is known, how hard
 * its exercises should be, and which mistakes to track. Runs inside the attempt's transaction, so
 * an answer is either recorded with all of this or not at all.
 */
@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async applyAttempt(tx: Tx, input: ApplyAttemptInput): Promise<AttemptLearning> {
    const itemUpdates: ItemUpdate[] = [];
    let mistakesResolved = 0;

    for (const result of input.items) {
      const existing = await tx.userItemState.findUnique({
        where: { userId_itemId: { userId: input.userId, itemId: result.itemId } },
      });
      const verdict: Verdict = result.isCorrect ? (input.evaluation.verdict === 'almost' ? 'almost' : 'correct') : 'wrong';

      // Only the first answer of each day moves the review schedule: repeating an item five times
      // in one sitting must not inflate its memory strength.
      const firstToday = dateOnly(existing?.lastReviewLocalDate) !== input.localDate;
      let srs: SrsState | null = existing ? srsFrom(existing) : null;
      if (firstToday) {
        const rating = ratingFor({
          verdict,
          hintsUsed: input.hintsUsed,
          level: input.level,
          durationMs: input.durationMs,
          estimatedSeconds: input.estimatedSeconds,
          selfRating: input.format === 'flashcard' ? (input.response as { rating?: number }).rating : undefined,
        });
        srs = reviewCard(srs, rating, input.now);
        await tx.reviewLog.create({
          data: {
            userId: input.userId,
            itemId: result.itemId,
            attemptId: input.attemptId,
            rating,
            stabilityAfter: srs.stability,
            dueAfter: srs.due ?? input.now,
          },
        });
      }

      const accuracyEwma = updateAccuracy(existing?.accuracyEwma ?? 0, result.score, existing?.reps ?? 0);
      const level = adaptLevel(
        {
          currentLevel: existing?.currentLevel ?? 'RECOGNITION',
          levelStreak: existing?.levelStreak ?? 0,
          highestLevelPassed: existing?.highestLevelPassed ?? null,
        },
        result.isCorrect,
      );
      const stability = srs?.stability ?? 0;
      const mastery = computeMastery({ stability, accuracyEwma, highestLevelPassed: level.highestLevelPassed });

      mistakesResolved += await this.trackMistakes(tx, input, result, verdict);
      const hasSeriousMistake = await this.hasSeriousMistake(tx, input.userId, result.itemId, input.now);

      const reps = srs?.reps ?? existing?.reps ?? 0;
      const lapses = srs?.lapses ?? existing?.lapses ?? 0;
      const status = statusFor({ reps, stability, mastery, highestLevelPassed: level.highestLevelPassed });

      const data = {
        status,
        isWeak: isWeakItem({ reps, lapses, accuracyEwma, hasSeriousMistake }),
        due: srs?.due ?? null,
        stability,
        difficulty: srs?.difficulty ?? 0,
        fsrsState: srs?.fsrsState ?? 0,
        reps,
        lapses,
        scheduledDays: srs?.scheduledDays ?? 0,
        learningSteps: srs?.learningSteps ?? 0,
        lastReviewedAt: srs?.lastReviewedAt ?? null,
        lastReviewLocalDate: firstToday ? toDate(input.localDate) : existing?.lastReviewLocalDate ?? null,
        mastery,
        accuracyEwma,
        currentLevel: level.currentLevel,
        highestLevelPassed: level.highestLevelPassed,
        levelStreak: level.levelStreak,
        firstSeenAt: existing?.firstSeenAt ?? input.now,
      };
      await tx.userItemState.upsert({
        where: { userId_itemId: { userId: input.userId, itemId: result.itemId } },
        create: { userId: input.userId, itemId: result.itemId, ...data },
        update: data,
      });
      itemUpdates.push({ itemId: result.itemId, status, mastery, due: data.due?.toISOString() ?? null });
    }
    return { itemUpdates, mistakesResolved };
  }

  /** A wrong answer records the error; a clean right answer on a new day counts toward fixing old ones. */
  private async trackMistakes(
    tx: Tx,
    input: ApplyAttemptInput,
    result: ApplyAttemptInput['items'][number],
    verdict: Verdict,
  ): Promise<number> {
    const { userId, now, localDate } = input;

    if (verdict !== 'correct') {
      const codes = [...new Set(result.errorCodes.length > 0 ? result.errorCodes : ['OTHER.OTHER'])] as ErrorTypeCode[];
      const userAnswer = describeResponse(input.format, input.content, input.response).slice(0, 300);
      const expectedAnswer = (input.evaluation.correctAnswerText ?? '').slice(0, 300);

      for (const code of codes) {
        const signature = mistakeSignature(result.itemId, code);
        const found = await tx.mistake.findUnique({ where: { userId_signature: { userId, signature } } });
        const recent = found
          ? await tx.mistakeOccurrence.count({ where: { mistakeId: found.id, createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } })
          : 0;
        const priority = mistakePriority({ severity: severityOf(code), occurrencesLast30Days: recent + 1, daysSinceLast: 0 });
        const reset = afterError();
        const mistake = found
          ? await tx.mistake.update({
              where: { id: found.id },
              data: {
                occurrences: { increment: 1 },
                status: reset.status,
                correctDays: reset.correctDays,
                lastCorrectDate: null,
                priority,
                lastSeenAt: now,
              },
            })
          : await tx.mistake.create({
              data: { userId, itemId: result.itemId, errorCode: code, signature, priority, firstSeenAt: now, lastSeenAt: now },
            });
        await tx.mistakeOccurrence.create({
          data: { mistakeId: mistake.id, attemptId: input.attemptId, userAnswer, expectedAnswer, createdAt: now },
        });
      }
      return 0;
    }

    const open = await tx.mistake.findMany({ where: { userId, itemId: result.itemId, status: { not: 'RESOLVED' } } });
    let resolved = 0;
    for (const m of open) {
      const next = afterCorrect(
        { status: m.status, correctDays: m.correctDays, lastCorrectDate: dateOnly(m.lastCorrectDate) },
        localDate,
      );
      if (next.correctDays === m.correctDays) continue;
      await tx.mistake.update({
        where: { id: m.id },
        data: { status: next.status, correctDays: next.correctDays, lastCorrectDate: toDate(localDate) },
      });
      if (next.status === 'RESOLVED') resolved++;
    }
    return resolved;
  }

  private async hasSeriousMistake(tx: Tx, userId: string, itemId: string, now: Date): Promise<boolean> {
    const open = await tx.mistake.findMany({
      where: { userId, itemId, status: { in: ['ACTIVE', 'IMPROVING'] } },
      select: { priority: true, lastSeenAt: true },
    });
    return open.some((m) => decayPriority(m.priority, (now.getTime() - m.lastSeenAt.getTime()) / DAY_MS) >= SERIOUS_PRIORITY);
  }

  /** The learner's state and open mistakes for a set of items, in two queries. */
  async contextFor(userId: string, itemIds: string[], now: Date, localDate: string): Promise<Map<string, ItemContext>> {
    const [states, mistakes] = await Promise.all([
      this.prisma.userItemState.findMany({ where: { userId, itemId: { in: itemIds } } }),
      this.prisma.mistake.findMany({
        where: { userId, itemId: { in: itemIds }, status: { in: ['ACTIVE', 'IMPROVING'] } },
        select: { itemId: true, priority: true, lastSeenAt: true },
      }),
    ]);
    const stateByItem = new Map(states.map((s) => [s.itemId, s]));
    const priorityByItem = new Map<string, number>();
    for (const m of mistakes) {
      const faded = decayPriority(m.priority, (now.getTime() - m.lastSeenAt.getTime()) / DAY_MS);
      priorityByItem.set(m.itemId, Math.max(priorityByItem.get(m.itemId) ?? 0, faded));
    }
    return new Map(
      itemIds.map((id) => {
        const state = stateByItem.get(id) ?? null;
        return [
          id,
          { state, mistakePriority: priorityByItem.get(id) ?? 0, seenToday: dateOnly(state?.lastReviewLocalDate) === localDate },
        ];
      }),
    );
  }
}
