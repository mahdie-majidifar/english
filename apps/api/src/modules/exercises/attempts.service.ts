import { Injectable } from '@nestjs/common';
import {
  RESPONSE_SCHEMAS,
  type AttemptRequest,
  type AttemptResult,
  type Evaluation,
  type ExerciseFormat,
  type SolutionOf,
} from '@coach/contracts';
import { evaluateRule } from '@coach/domain';
import { DomainError, notFound } from '../../core/http/domain-error.js';
import { isUniqueViolation } from '../../core/prisma/errors.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { Prisma, type ExerciseAttempt } from '../../generated/prisma/client.js';
import { AnswerEvaluatorService } from '../ai/answer-evaluator.service.js';

function toResult(attemptId: string, e: Omit<Evaluation, 'needsAi'>): AttemptResult {
  return {
    attemptId,
    verdict: e.verdict,
    isCorrect: e.isCorrect,
    score: e.score,
    correctAnswerText: e.correctAnswerText,
    explanationFa: e.explanationFa,
    errorCodes: e.errorCodes,
    detail: e.detail,
  };
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: AnswerEvaluatorService,
  ) {}

  /**
   * Checks an answer, records it, and returns the verdict. Sending the same attempt twice (a retry
   * after a dropped connection) returns the first result and records nothing new.
   */
  async submit(userId: string, request: AttemptRequest): Promise<AttemptResult> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: request.exerciseId, ownerId: userId, status: 'ACTIVE' },
      include: { items: { select: { itemId: true } } },
    });
    if (!exercise) throw notFound('Exercise not found.');
    const format = exercise.format as ExerciseFormat;

    const prior = await this.prisma.exerciseAttempt.findUnique({ where: { id: request.clientAttemptId } });
    if (prior) return this.replay(userId, exercise.id, prior);

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

    const { needsAi: _needsAi, ...stored } = evaluation;
    try {
      const attempt = await this.prisma.exerciseAttempt.create({
        data: {
          id: request.clientAttemptId,
          userId,
          exerciseId: exercise.id,
          context: 'PRACTICE',
          response: parsed.data as Prisma.InputJsonValue,
          score: evaluation.score,
          isCorrect: evaluation.isCorrect,
          verdict: evaluation.verdict,
          evaluation: stored as unknown as Prisma.InputJsonValue,
          evaluatedBy,
          durationMs: request.durationMs,
          hintsUsed: request.hintsUsed,
          items: {
            create: exercise.items.map(({ itemId }) => ({
              itemId,
              ...this.resultForItem(format, exercise.solution, evaluation, itemId),
            })),
          },
        },
      });
      return toResult(attempt.id, stored);
    } catch (error) {
      // The same attempt arrived twice at once; the other request won.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.exerciseAttempt.findUnique({ where: { id: request.clientAttemptId } });
        if (winner) return this.replay(userId, exercise.id, winner);
      }
      throw error;
    }
  }

  private replay(userId: string, exerciseId: string, prior: ExerciseAttempt): AttemptResult {
    if (prior.userId !== userId || prior.exerciseId !== exerciseId) {
      throw new DomainError('CONFLICT', 409, 'This attempt id was already used.');
    }
    return toResult(prior.id, prior.evaluation as unknown as Omit<Evaluation, 'needsAi'>);
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
