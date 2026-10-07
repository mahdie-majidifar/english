import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ErrorTypeCodeSchema,
  type ContentOf,
  type Evaluation,
  type ExerciseFormat,
  type SolutionOf,
} from '@coach/contracts';
import { AppConfig } from '../../core/config/env.js';
import { AiGateway } from './ai-gateway.service.js';
import { EVALUATE_ANSWER_PROMPT, buildEvaluateMessages } from './prompts/evaluate-answer.js';

export const AiEvaluationSchema = z.object({
  verdict: z.enum(['correct', 'almost', 'wrong']),
  score: z.number().min(0).max(1),
  correctedAnswer: z.string().nullable(),
  explanationFa: z.string(),
  errorCodes: z.array(ErrorTypeCodeSchema),
});

/** The task as plain words, for the evaluator. */
function describeTask(format: ExerciseFormat, content: unknown): string {
  switch (format) {
    case 'translation_fa_en': {
      const c = content as ContentOf['translation_fa_en'];
      return `${c.instruction}\nPersian sentence: ${c.promptFa}`;
    }
    case 'transformation': {
      const c = content as ContentOf['transformation'];
      return `${c.instruction}\nSentence: ${c.source}\nTask: ${c.task}`;
    }
    case 'free_production': {
      const c = content as ContentOf['free_production'];
      const words = c.targetWords.length > 0 ? `\nThe answer should use: ${c.targetWords.join(', ')}` : '';
      return `${c.instruction}\nPrompt: ${c.prompt}${words}`;
    }
    default:
      return JSON.stringify(content);
  }
}

/** Judges free-text answers. Everything else is checked by plain code, never by the AI. */
@Injectable()
export class AnswerEvaluatorService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly config: AppConfig,
  ) {}

  async evaluate(
    userId: string,
    format: ExerciseFormat,
    content: unknown,
    solution: SolutionOf['free_production'],
    answer: string,
  ): Promise<{ evaluation: Evaluation; runId: string }> {
    const { data, runId } = await this.gateway.generateObject({
      userId,
      task: 'EVALUATE_ANSWER',
      promptId: EVALUATE_ANSWER_PROMPT.id,
      promptVersion: EVALUATE_ANSWER_PROMPT.version,
      model: this.config.env.AI_MODEL_EVALUATE ?? this.config.env.AI_MODEL_PARSE,
      messages: buildEvaluateMessages({
        format,
        taskDescription: describeTask(format, content),
        referenceAnswers: solution.referenceAnswers,
        rubric: solution.rubric,
        learnerAnswer: answer,
      }),
      schema: AiEvaluationSchema,
      schemaName: 'answer_evaluation',
      timeoutMs: 30_000,
      maxOutputTokens: 600,
    });

    const wrong = data.verdict === 'wrong';
    // The verdict decides the score band, so a sloppy number from the model cannot contradict it.
    const score = data.verdict === 'correct' ? Math.max(data.score, 0.9) : wrong ? Math.min(data.score, 0.4) : Math.min(Math.max(data.score, 0.6), 0.9);
    return {
      runId,
      evaluation: {
        verdict: data.verdict,
        score,
        isCorrect: !wrong,
        errorCodes: data.verdict === 'correct' ? [] : data.errorCodes.length > 0 ? data.errorCodes : ['OTHER.OTHER'],
        correctAnswerText: data.correctedAnswer ?? solution.referenceAnswers[0] ?? null,
        explanationFa: data.explanationFa || solution.explanationFa || null,
        detail: { evaluatedBy: 'AI' },
        needsAi: false,
      },
    };
  }
}
