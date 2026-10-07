import { emptyDraftItem, type DraftItem, type ItemType, type ParsedMaterial } from '@coach/contracts';
import { normalizeAnswer } from '@coach/domain';
import type { JsonRequest, JsonResult, LlmProvider } from '../llm.js';

const HEADINGS: Record<string, ItemType> = {
  vocabulary: 'VOCABULARY',
  vocab: 'VOCABULARY',
  words: 'VOCABULARY',
  collocations: 'COLLOCATION',
  collocation: 'COLLOCATION',
  grammar: 'GRAMMAR',
  expressions: 'EXPRESSION',
  expression: 'EXPRESSION',
  'word formation': 'WORD_FORMATION',
  'irregular verbs': 'IRREGULAR_VERB',
  pronunciation: 'PRONUNCIATION',
};

/** Pulls the pasted notes back out of the prompt the parser built. */
function materialText(request: JsonRequest): string {
  const user = request.messages.at(-1);
  const content = typeof user?.content === 'string' ? user.content : '';
  const match = /<material>\n([\s\S]*?)\n<\/material>/.exec(content);
  return match?.[1] ?? '';
}

/**
 * A stand-in for a real model, for trying the whole flow without an API key.
 * It only understands simple notes ("Vocabulary:" followed by one word per line) and never invents meanings.
 * Enabled explicitly with AI_PROVIDER=mock; it is never chosen automatically.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly isConfigured = true;

  async generateJson(request: JsonRequest): Promise<JsonResult> {
    if (request.schemaName === 'answer_evaluation') return this.evaluate(request);
    if (request.schemaName === 'generated_exercises') return this.respond({ exercises: [] });
    const items: DraftItem[] = [];
    let current: ItemType = 'VOCABULARY';

    for (const raw of materialText(request).split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const heading = /^([A-Za-z ]+):\s*(.*)$/.exec(line);
      const type = heading ? HEADINGS[heading[1]!.trim().toLowerCase()] : undefined;
      if (type) {
        current = type;
        if (heading![2]) items.push({ ...emptyDraftItem(current, heading![2].trim()), confidence: 'medium' });
        continue;
      }
      if (/^session\s*\d*/i.test(line) || line.length > 60) continue;
      items.push({ ...emptyDraftItem(current, line), confidence: 'medium' });
    }

    const parsed: ParsedMaterial = {
      summary: `Mock analysis: found ${items.length} item${items.length === 1 ? '' : 's'}.`,
      items,
      exercises: [],
    };
    return { json: parsed, rawText: JSON.stringify(parsed), inputTokens: 0, outputTokens: 0 };
  }

  /** Only recognises an answer that matches a model answer; everything else is "wrong". */
  private evaluate(request: JsonRequest): JsonResult {
    const text = typeof request.messages.at(-1)?.content === 'string' ? (request.messages.at(-1)!.content as string) : '';
    const learner = /<learner_answer>\n([\s\S]*?)\n<\/learner_answer>/.exec(text)?.[1] ?? '';
    const models = (/<model_answers>\n([\s\S]*?)\n<\/model_answers>/.exec(text)?.[1] ?? '').split('\n');
    const match = models.some((m) => normalizeAnswer(m) === normalizeAnswer(learner));
    return this.respond({
      verdict: match ? 'correct' : 'wrong',
      score: match ? 1 : 0,
      correctedAnswer: match ? null : (models[0] && !models[0].startsWith('(none') ? models[0] : null),
      explanationFa: 'این یک بررسی آزمایشی است (حالت mock) و فقط پاسخ‌های مطابق نمونه را درست می‌داند.',
      errorCodes: match ? [] : ['OTHER.OTHER'],
    });
  }

  private respond(json: unknown): JsonResult {
    return { json, rawText: JSON.stringify(json), inputTokens: 0, outputTokens: 0 };
  }
}