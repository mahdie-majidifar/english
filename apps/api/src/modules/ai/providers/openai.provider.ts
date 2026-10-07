import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../core/config/env.js';
import {
  LlmError,
  type JsonRequest,
  type JsonResult,
  type LlmMessage,
  type LlmProvider,
} from '../llm.js';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function toOpenAiMessage(message: LlmMessage) {
  if (typeof message.content === 'string') return { role: message.role, content: message.content };
  return {
    role: message.role,
    content: message.content.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.base64}` } },
    ),
  };
}

/** OpenAI Chat Completions with strict JSON-schema output. Works with any compatible gateway via OPENAI_BASE_URL. */
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return Boolean(this.config.env.OPENAI_API_KEY);
  }

  async generateJson(request: JsonRequest): Promise<JsonResult> {
    const key = this.config.env.OPENAI_API_KEY;
    if (!key) throw new LlmError('OPENAI_API_KEY is not set.', false);
    const base = (this.config.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map(toOpenAiMessage),
          response_format: {
            type: 'json_schema',
            json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
          },
          ...(request.maxOutputTokens ? { max_completion_tokens: request.maxOutputTokens } : {}),
        }),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      throw new LlmError(timedOut ? 'The AI took too long to answer.' : 'Could not reach the AI service.', true);
    } finally {
      clearTimeout(timer);
    }

    const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

    if (!response.ok) {
      const detail = body.error?.message?.slice(0, 200);
      if (response.status === 401 || response.status === 403) {
        throw new LlmError('The AI service rejected the API key.', false, response.status);
      }
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmError(detail ?? `The AI service returned ${response.status}.`, retryable, response.status);
    }

    const message = body.choices?.[0]?.message;
    if (message?.refusal) throw new LlmError('The AI declined to read this material.', false);
    if (!message?.content) throw new LlmError('The AI returned an empty answer.', true);

    let json: unknown;
    try {
      json = JSON.parse(message.content);
    } catch {
      throw new LlmError('The AI returned something that is not valid JSON.', true);
    }

    return {
      json,
      rawText: message.content,
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
    };
  }
}
