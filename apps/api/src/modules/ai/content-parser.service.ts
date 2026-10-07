import { Injectable } from '@nestjs/common';
import { normalizeKey } from '@coach/domain';
import { ParsedMaterialSchema, type ParsedMaterial } from '@coach/contracts';
import { AppConfig } from '../../core/config/env.js';
import { AiGateway } from './ai-gateway.service.js';
import {
  PARSE_MATERIAL_PROMPT,
  buildParseMaterialMessages,
  type ParseMaterialInput,
} from './prompts/parse-material.js';

/** Tidies the model's answer: trims, drops empties and repeated items. Meaning is never changed. */
export function normalizeParsed(parsed: ParsedMaterial): ParsedMaterial {
  const seen = new Set<string>();
  const items = parsed.items.flatMap((item) => {
    const headword = item.headword.trim();
    if (!headword) return [];
    const key = `${item.type}:${normalizeKey(headword)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, headword }];
  });
  const exercises = parsed.exercises.filter((e) => e.originalText.trim().length > 0);
  return { summary: parsed.summary.trim(), items, exercises };
}

@Injectable()
export class ContentParserService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly config: AppConfig,
  ) {}

  async parse(userId: string, input: ParseMaterialInput): Promise<{ proposal: ParsedMaterial; runId: string }> {
    const { data, runId } = await this.gateway.generateObject({
      userId,
      task: 'PARSE_MATERIAL',
      promptId: PARSE_MATERIAL_PROMPT.id,
      promptVersion: PARSE_MATERIAL_PROMPT.version,
      model: this.config.env.AI_MODEL_PARSE,
      messages: buildParseMaterialMessages(input),
      schema: ParsedMaterialSchema,
      schemaName: 'parsed_material',
      timeoutMs: input.image ? 120_000 : 90_000,
    });
    return { proposal: normalizeParsed(data), runId };
  }
}
