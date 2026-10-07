import { Inject, Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import { AppConfig } from '../../core/config/env.js';
import { DomainError } from '../../core/http/domain-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { toProviderJsonSchema } from './json-schema.js';
import { LLM_PROVIDER, LlmError, type LlmMessage, type LlmProvider } from './llm.js';

export interface GenerateObjectOptions<T> {
  userId: string;
  /** What this call is for, e.g. "PARSE_MATERIAL". Stored in AiRun. */
  task: string;
  promptId: string;
  promptVersion: number;
  model: string;
  messages: LlmMessage[];
  schema: z.ZodType<T>;
  schemaName: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The only door to a language model. It adds what every call needs: a daily ceiling, retries for
 * transient failures, one automatic repair when the reply does not fit the schema, and a record
 * of every run. Feature code never talks to a provider directly.
 */
@Injectable()
export class AiGateway {
  private readonly logger = new Logger('AI');

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  get isConfigured(): boolean {
    return this.provider.isConfigured;
  }

  async generateObject<T>(options: GenerateObjectOptions<T>): Promise<{ data: T; runId: string }> {
    if (!this.provider.isConfigured) {
      throw new DomainError(
        'AI_NOT_CONFIGURED',
        503,
        'AI is not set up yet. Add OPENAI_API_KEY to the .env file and restart the API.',
      );
    }
    await this.assertUnderDailyLimit(options.userId);

    const jsonSchema = toProviderJsonSchema(options.schema);
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let messages = options.messages;
    let repaired = false;
    let lastError = 'Unknown error';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.provider.generateJson({
          model: options.model,
          messages,
          schemaName: options.schemaName,
          jsonSchema,
          timeoutMs: options.timeoutMs ?? 90_000,
          maxOutputTokens: options.maxOutputTokens,
        });
        inputTokens += result.inputTokens ?? 0;
        outputTokens += result.outputTokens ?? 0;

        const parsed = options.schema.safeParse(result.json);
        if (parsed.success) {
          const runId = await this.record(options, true, started, inputTokens, outputTokens);
          return { data: parsed.data, runId };
        }

        lastError = `Reply did not match the schema: ${parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        if (repaired) break;
        // One repair attempt: show the model exactly what was wrong.
        repaired = true;
        messages = [
          ...options.messages,
          { role: 'assistant', content: result.rawText },
          {
            role: 'user',
            content: `Your JSON failed validation (${lastError}). Reply again with corrected JSON only.`,
          },
        ];
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        lastError = error.message;
        if (!error.retryable || attempt === MAX_ATTEMPTS) {
          await this.record(options, false, started, inputTokens, outputTokens, lastError);
          throw new DomainError(
            'AI_UNAVAILABLE',
            error.status === 401 || error.status === 403 ? 502 : 503,
            error.retryable ? `${error.message} Please try again in a moment.` : error.message,
          );
        }
        await sleep(500 * 2 ** (attempt - 1));
      }
    }

    await this.record(options, false, started, inputTokens, outputTokens, lastError);
    this.logger.warn(`${options.task} failed after repair: ${lastError}`);
    throw new DomainError('AI_UNAVAILABLE', 502, 'The AI gave an answer we could not use. Please try again.');
  }

  private async assertUnderDailyLimit(userId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const used = await this.prisma.aiRun.count({ where: { userId, createdAt: { gte: startOfDay } } });
    if (used >= this.config.env.AI_DAILY_CALL_LIMIT) {
      throw new DomainError(
        'RATE_LIMITED',
        429,
        'You have reached today’s AI limit. It resets tomorrow (UTC).',
      );
    }
  }

  private async record(
    options: GenerateObjectOptions<unknown>,
    success: boolean,
    started: number,
    inputTokens: number,
    outputTokens: number,
    errorMessage?: string,
  ): Promise<string> {
    const run = await this.prisma.aiRun.create({
      data: {
        userId: options.userId,
        task: options.task,
        provider: this.provider.name,
        model: options.model,
        promptId: options.promptId,
        promptVersion: options.promptVersion,
        success,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        latencyMs: Date.now() - started,
        errorMessage: errorMessage?.slice(0, 500),
      },
    });
    return run.id;
  }
}
