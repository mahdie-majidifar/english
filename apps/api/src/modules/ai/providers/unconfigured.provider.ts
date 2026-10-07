import { LlmError, type JsonResult, type LlmProvider } from '../llm.js';

/** Used when no AI credentials exist, so the rest of the app keeps working. */
export class UnconfiguredProvider implements LlmProvider {
  readonly name = 'none';
  readonly isConfigured = false;

  async generateJson(): Promise<JsonResult> {
    throw new LlmError('AI is not configured.', false);
  }
}
