import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  parseExerciseParts,
  type ExerciseFormat,
  type ExerciseLevel,
  type ItemType,
} from '@coach/contracts';
import { normalizeAnswer, type ExerciseDraft } from '@coach/domain';
import { AppConfig } from '../../core/config/env.js';
import { AiGateway } from './ai-gateway.service.js';
import { GENERATE_EXERCISES_PROMPT, buildGenerateMessages } from './prompts/generate-exercises.js';

const GENERATED_FORMATS = ['multiple_choice', 'fill_blank', 'transformation', 'translation_fa_en', 'free_production'] as const;

export const GeneratedExercisesSchema = z.object({
  exercises: z.array(
    z.object({
      format: z.enum(GENERATED_FORMATS),
      instruction: z.string(),
      helper: z.string(),
      prompt: z.string(),
      task: z.string().nullable(),
      options: z.array(z.string()),
      correctOption: z.string().nullable(),
      acceptedAnswers: z.array(z.string()),
      targetWords: z.array(z.string()),
      explanationFa: z.string(),
    }),
  ),
});
export type GeneratedExercise = z.infer<typeof GeneratedExercisesSchema>['exercises'][number];

const LEVEL: Record<(typeof GENERATED_FORMATS)[number], ExerciseLevel> = {
  multiple_choice: 'CONTEXT',
  fill_blank: 'CONTEXT',
  transformation: 'PRODUCTION',
  translation_fa_en: 'PRODUCTION',
  free_production: 'PRODUCTION',
};

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'];
const clean = (s: string) => s.trim();
const present = (s: string | null | undefined): s is string => Boolean(s && s.trim());

export interface ItemForGeneration {
  id: string;
  type: ItemType;
  headword: string;
  meaningEn: string | null;
  meaningFa: string | null;
  payload: Record<string, unknown>;
}

/** Turns one AI proposal into a draft, or explains why it is not good enough. */
export function toDraft(item: ItemForGeneration, g: GeneratedExercise): { draft?: ExerciseDraft; reason?: string } {
  const format: ExerciseFormat = g.format;
  const instruction = clean(g.instruction);
  const helper = clean(g.helper);
  const prompt = clean(g.prompt);
  if (!instruction || !prompt) return { reason: 'missing instruction or prompt' };

  const common = { instruction, helper: helper || undefined };
  const explanationFa = present(g.explanationFa) ? clean(g.explanationFa) : undefined;
  const accepted = [...new Set(g.acceptedAnswers.map(clean).filter(Boolean))];
  let content: unknown;
  let solution: unknown;

  switch (g.format) {
    case 'multiple_choice': {
      const texts = g.options.map(clean).filter(Boolean);
      const unique = new Set(texts.map((t) => normalizeAnswer(t)));
      if (texts.length < 3 || texts.length > 4) return { reason: 'needs 3 or 4 options' };
      if (unique.size !== texts.length) return { reason: 'duplicate options' };
      const correct = present(g.correctOption) ? clean(g.correctOption) : '';
      const index = texts.findIndex((t) => normalizeAnswer(t) === normalizeAnswer(correct));
      if (index === -1) return { reason: 'correct option is not among the options' };
      const options = texts.map((text, i) => ({ id: OPTION_IDS[i]!, text }));
      content = { ...common, prompt, options };
      solution = {
        correctOptionId: options[index]!.id,
        distractorErrors: Object.fromEntries(options.filter((_, i) => i !== index).map((o) => [o.id, 'OTHER.OTHER'])),
        explanationFa,
      };
      break;
    }
    case 'fill_blank': {
      if (prompt.split('___').length !== 2) return { reason: 'sentence must contain exactly one gap' };
      if (accepted.length === 0) return { reason: 'no accepted answers' };
      const sentenceWords = normalizeAnswer(prompt).split(' ');
      if (accepted.some((a) => !a.includes(' ') && sentenceWords.includes(normalizeAnswer(a)))) {
        return { reason: 'the answer appears in the sentence' };
      }
      content = { ...common, sentence: prompt };
      solution = { acceptedAnswers: accepted, explanationFa };
      break;
    }
    case 'transformation': {
      if (!present(g.task)) return { reason: 'missing task' };
      if (accepted.length === 0) return { reason: 'no model answers' };
      content = { ...common, source: prompt, task: clean(g.task) };
      solution = { referenceAnswers: accepted, explanationFa };
      break;
    }
    case 'translation_fa_en': {
      if (accepted.length === 0) return { reason: 'no model translations' };
      content = { ...common, promptFa: prompt };
      solution = { referenceAnswers: accepted, explanationFa };
      break;
    }
    case 'free_production': {
      const targets = g.targetWords.map(clean).filter(Boolean);
      if (targets.length === 0) return { reason: 'no target words' };
      content = { ...common, prompt, targetWords: targets };
      solution = {
        referenceAnswers: [],
        rubric: `Answer must use ${targets.join(', ')} correctly in natural English.`,
        explanationFa,
      };
      break;
    }
  }

  // The item has to be what the exercise is about.
  const haystack = normalizeAnswer(JSON.stringify([content, accepted]));
  const stem = normalizeAnswer(item.headword).replace(/(e|y)$/, '');
  if (stem.length >= 3 && !haystack.includes(stem)) return { reason: 'does not practise the item' };

  const parsed = parseExerciseParts(format, content, solution);
  if (!parsed.success) return { reason: parsed.error };

  return {
    draft: {
      format,
      level: LEVEL[g.format],
      skill: item.type === 'COLLOCATION' ? 'COLLOCATION' : item.type === 'EXPRESSION' ? 'EXPRESSION' : item.type === 'VOCABULARY' ? 'VOCABULARY' : item.type === 'WORD_FORMATION' ? 'WORD_FORMATION' : 'GRAMMAR',
      content: parsed.content,
      solution: parsed.solution,
      itemIds: [item.id],
      key: `ai|${item.id}|${format}|${normalizeAnswer(prompt)}`,
    },
  };
}

@Injectable()
export class ExerciseGeneratorService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly config: AppConfig,
  ) {}

  /** Asks the AI for extra exercises for one item and keeps only the ones that pass the quality gate. */
  async generate(
    userId: string,
    item: ItemForGeneration,
    count = 4,
  ): Promise<{ drafts: ExerciseDraft[]; rejected: string[]; runId: string }> {
    const examples = Array.isArray(item.payload['examples']) ? (item.payload['examples'] as string[]) : [];
    const { data, runId } = await this.gateway.generateObject({
      userId,
      task: 'GENERATE_EXERCISES',
      promptId: GENERATE_EXERCISES_PROMPT.id,
      promptVersion: GENERATE_EXERCISES_PROMPT.version,
      model: this.config.env.AI_MODEL_GENERATE ?? this.config.env.AI_MODEL_PARSE,
      messages: buildGenerateMessages({
        type: item.type,
        headword: item.headword,
        meaningEn: item.meaningEn,
        meaningFa: item.meaningFa,
        examples,
        count,
      }),
      schema: GeneratedExercisesSchema,
      schemaName: 'generated_exercises',
      timeoutMs: 60_000,
    });

    const drafts: ExerciseDraft[] = [];
    const rejected: string[] = [];
    const seen = new Set<string>();
    for (const g of data.exercises) {
      const { draft, reason } = toDraft(item, g);
      if (!draft) rejected.push(reason ?? 'rejected');
      else if (seen.has(draft.key)) rejected.push('duplicate');
      else {
        seen.add(draft.key);
        drafts.push(draft);
      }
    }
    return { drafts, rejected, runId };
  }
}
