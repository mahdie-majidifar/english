import type { JsonRequest, JsonResult, LlmProvider } from '../llm.js';

type Responder = (request: JsonRequest, callNumber: number) => unknown | Promise<unknown>;

/** Deterministic stand-in for tests: replies with whatever the responder returns, and records calls. */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  isConfigured = true;
  readonly calls: JsonRequest[] = [];

  constructor(private responder: Responder) {}

  setResponder(responder: Responder): void {
    this.responder = responder;
  }

  async generateJson(request: JsonRequest): Promise<JsonResult> {
    this.calls.push(request);
    const json = await this.responder(request, this.calls.length);
    return { json, rawText: JSON.stringify(json), inputTokens: 100, outputTokens: 50 };
  }
}
