import { Injectable } from '@nestjs/common';
import {
  RESPONSE_SCHEMAS,
  type AttemptRequest,
  type AttemptResult,
  type Evaluation,
  type ExerciseFormat,
  type ExerciseLevel,
  type ItemUpdate,
  type SolutionOf,
} from '@coach/contracts';
import { evaluateRule, toLocalDate, xpForAttempt } from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type ExerciseAttempt } from '../../generated/prisma/client.js';
import { AnswerEvaluatorService } from '../ai/answer-evaluator.service.js';
import { LearningService } from '../learning/learning.service.js';
import { ProgressService } from '../progress/progress.service.js';

/** What is stored with an attempt and returned for it: the evaluation plus what it earned and changed. */
type StoredResult = Omit<Evaluation, 'needsAi'> & { xp: number; itemUpdates: ItemUpdate[] };

function toResult(attemptId: string, e: StoredResult): AttemptResult {
  return {
    attemptId,
    verdict: e.verdict,
    isCorrect: e.isCorrect,
    score: e.score,
    correctAnswerText: e.correctAnswerText,
    explanationFa: e.explanationFa,
    errorCodes: e.errorCodes,
    detail: e.detail,
    xp: e.xp ?? 0,
    itemUpdates: e.itemUpdates ?? [],
  };
}

/** Set when the answer is part of a quiz or an exam rather than practice or the daily session. */
export interface AssessmentContext {
  /** Also the attempt's id, so handing an exam in twice can never record an answer twice. */
  questionId: string;
  kind: 'QUIZ' | 'EXAM';
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: AnswerEvaluatorService,
    private readonly learning: LearningService,
    private readonly progress: ProgressService,
  ) {}

  /**
   * Checks an answer, records it, and returns the verdict. Sending the same attempt twice (a retry
   * after a dropped connection) returns the first result and records nothing new.
   *
   * Recording an answer also updates what the learner knows (review schedule, mastery, level),
   * their mistakes, XP and daily activity, all in one transaction.
   */
  async submit(userId: string, request: AttemptRequest, assessment?: AssessmentContext): Promise<AttemptResult> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: request.exerciseId, ownerId: userId, status: 'ACTIVE' },
      include: { items: { select: { itemId: true } } },
    });
    if (!exercise) throw notFound('Exercise not found.');
    const format = exercise.format as ExerciseFormat;

    const prior = await this.prisma.exerciseAttempt.findUnique({ where: { id: request.clientAttemptId } });
    if (prior) return this.replay(userId, exercise.id, prior);

    const slot = !assessment && request.sessionItemId ? await this.requireOpenSlot(userId, request.sessionItemId, exercise.id) : null;

    const parsed = RESPONSE_SCHEMAS[format].safeParse(request.response);
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', 400, 'That answer is not in the right shape.', [
        { path: 'response', message: parsed.error.issues[0]?.message ?? 'Invalid answer.' },
      ]);
    }

    let evaluation = evaluateRule(format, exercise.content, exercise.solution, parsed.data);
    let evaluatedBy: 'RULE' | 'AI' = 'RULE';
    if (evaluation.needsAi) {
      // If the AI is unavailable this throws, and nothing is recorded: the learner can retry or skip.
      const answer = (parsed.data as { answer: string }).answer;
      evaluation = (
        await this.evaluator.evaluate(
          userId,
          format,
          exercise.content,
          exercise.solution as SolutionOf['free_production'],
          answer,
        )
      ).evaluation;
      evaluatedBy = 'AI';
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const now = new Date();
    const localDate = toLocalDate(now, user.timezone);
    // Inside a quiz or exam the XP comes from the final score, not from each answer.
    const xp = assessment ? 0 : xpForAttempt({ verdict: evaluation.verdict, level: exercise.level as ExerciseLevel });
    const itemResults = exercise.items.map(({ itemId }) => ({
      itemId,
      ...this.resultForItem(format, exercise.solution, evaluation, itemId),
    }));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const attemptId = request.clientAttemptId;
        const learned = await this.learning.applyAttempt(tx, {
          userId,
          now,
          localDate,
          attemptId,
          format,
          level: exercise.level as ExerciseLevel,
          estimatedSeconds: exercise.estimatedSeconds,
          content: exercise.content,
          response: parsed.data,
          evaluation,
          hintsUsed: request.hintsUsed,
          durationMs: request.durationMs,
          // An exam proves more than practice does, so a right answer there counts double toward moving up.
          evidenceWeight: assessment?.kind === 'EXAM' ? 2 : 1,
          items: itemResults,
        });
        await this.progress.recordAttempt(tx, {
          userId,
          localDate,
          attemptId,
          xp,
          durationMs: request.durationMs,
          isCorrect: evaluation.isCorrect,
        });

        const { needsAi: _needsAi, ...base } = evaluation;
        const stored: StoredResult = { ...base, xp, itemUpdates: learned.itemUpdates };
        await tx.exerciseAttempt.create({
          data: {
            id: attemptId,
            userId,
            exerciseId: exercise.id,
            context: assessment ? assessment.kind : slot ? 'DAILY_SESSION' : 'PRACTICE',
            sessionItemId: slot?.id,
            assessmentQuestionId: assessment?.questionId,
            response: parsed.data as Prisma.InputJsonValue,
            score: evaluation.score,
            isCorrect: evaluation.isCorrect,
            verdict: evaluation.verdict,
            evaluation: stored as unknown as Prisma.InputJsonValue,
            evaluatedBy,
            durationMs: request.durationMs,
            hintsUsed: request.hintsUsed,
            createdAt: now,
            items: { create: itemResults },
          },
        });
        if (slot) {
          await tx.dailySession.update({
            where: { id: slot.sessionId },
            data: { status: 'IN_PROGRESS', startedAt: slot.startedAt ?? now },
          });
        }
        return toResult(attemptId, stored);
      });
    } catch (error) {
      // The same attempt arrived twice at once; the other request won.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.exerciseAttempt.findUnique({ where: { id: request.clientAttemptId } });
        if (winner) return this.replay(userId, exercise.id, winner);
      }
      throw error;
    }
  }

  /** The slot must belong to the learner's own, unfinished session, and be for this very exercise. */
  private async requireOpenSlot(userId: string, sessionItemId: string, exerciseId: string) {
    const slot = await this.prisma.dailySessionItem.findFirst({
      where: { id: sessionItemId, exerciseId, session: { userId } },
      include: { session: { select: { id: true, status: true, startedAt: true } } },
    });
    if (!slot) throw notFound('Session exercise not found.');
    if (slot.session.status === 'COMPLETED') {
      throw new DomainError('CONFLICT', 409, 'This session is already finished.');
    }
    const answered = await this.prisma.exerciseAttempt.findUnique({ where: { sessionItemId: slot.id }, select: { id: true } });
    if (answered) throw new DomainError('CONFLICT', 409, 'This exercise was already answered in the session.');
    return { id: slot.id, sessionId: slot.session.id, startedAt: slot.session.startedAt };
  }

  private replay(userId: string, exerciseId: string, prior: ExerciseAttempt): AttemptResult {
    if (prior.userId !== userId || prior.exerciseId !== exerciseId) {
      throw new DomainError('CONFLICT', 409, 'This attempt id was already used.');
    }
    return toResult(prior.id, prior.evaluation as unknown as StoredResult);
  }

  /** A matching exercise covers several items: each one is judged on its own pair. */
  private resultForItem(
    format: ExerciseFormat,
    solution: Prisma.JsonValue,
    evaluation: Evaluation,
    itemId: string,
  ): { isCorrect: boolean; score: number; errorCodes: string[] } {
    if (format === 'matching') {
      const itemByLeft = (solution as SolutionOf['matching']).itemByLeft ?? {};
      const results = (evaluation.detail['results'] ?? {}) as Record<string, boolean>;
      const leftId = Object.keys(itemByLeft).find((l) => itemByLeft[l] === itemId);
      if (leftId !== undefined) {
        const ok = results[leftId] === true;
        return { isCorrect: ok, score: ok ? 1 : 0, errorCodes: ok ? [] : evaluation.errorCodes };
      }
    }
    return { isCorrect: evaluation.isCorrect, score: evaluation.score, errorCodes: evaluation.errorCodes };
  }
}
