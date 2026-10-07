/**
 * Provider-neutral contract for talking to a language model.
 * The rest of the app only ever sees these types, so switching provider (or model) is a config change.
 */

export type LlmPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64: string };

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmPart[];
}

export interface JsonRequest {
  model: string;
  messages: LlmMessage[];
  /** Identifier for the response format, e.g. "parsed_material". */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  timeoutMs: number;
  maxOutputTokens?: number;
}

export interface JsonResult {
  json: unknown;
  rawText: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  /** False when no credentials are available; callers should say so instead of failing mysteriously. */
  readonly isConfigured: boolean;
  generateJson(request: JsonRequest): Promise<JsonResult>;
}

/** A failed model call. `retryable` marks transient problems (rate limit, network, 5xx). */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Injection token for the active provider. */
export const LLM_PROVIDER = 'LLM_PROVIDER';
