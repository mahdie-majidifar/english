import { Injectable } from '@nestjs/common';
import { ExplanationSchema, ParsedMaterialSchema, type Explanation, type ParsedMaterial } from '@coach/contracts';
import { AppConfig } from '../../core/config/env.js';
import { AiGateway } from './ai-gateway.service.js';
import { normalizeParsed } from './content-parser.service.js';
import { EXPLAIN_ITEM_PROMPT, buildExplainMessages, type ExplainItemInput } from './prompts/explain-item.js';
import { SUGGEST_LESSON_PROMPT, buildSuggestMessages, type SuggestLessonInput } from './prompts/suggest-lesson.js';

/** The two things the AI writes for teaching: a mini-lesson about an item, and starter items for a lesson. */
@Injectable()
export class LearningContentService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly config: AppConfig,
  ) {}

  async explain(userId: string, input: ExplainItemInput): Promise<{ explanation: Explanation; runId: string }> {
    const { data, runId } = await this.gateway.generateObject({
      userId,
      task: 'EXPLAIN_ITEM',
      promptId: EXPLAIN_ITEM_PROMPT.id,
      promptVersion: EXPLAIN_ITEM_PROMPT.version,
      model: this.config.env.AI_MODEL_GENERATE ?? this.config.env.AI_MODEL_PARSE,
      messages: buildExplainMessages(input),
      schema: ExplanationSchema,
      schemaName: 'item_explanation',
      timeoutMs: 60_000,
    });
    return { explanation: data, runId };
  }

  async suggest(userId: string, input: SuggestLessonInput): Promise<{ proposal: ParsedMaterial; runId: string }> {
    const { data, runId } = await this.gateway.generateObject({
      userId,
      task: 'SUGGEST_LESSON',
      promptId: SUGGEST_LESSON_PROMPT.id,
      promptVersion: SUGGEST_LESSON_PROMPT.version,
      model: this.config.env.AI_MODEL_PARSE,
      messages: buildSuggestMessages(input),
      schema: ParsedMaterialSchema,
      schemaName: 'suggested_lesson_content',
      timeoutMs: 90_000,
    });
    // Suggestions are never "from the teacher": no exercises, and nothing is marked high confidence.
    const proposal = normalizeParsed({ ...data, exercises: [] });
    return { proposal: { ...proposal, items: proposal.items.map((i) => ({ ...i, confidence: 'medium' })) }, runId };
  }
}
