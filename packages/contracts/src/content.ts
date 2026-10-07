import { z } from 'zod';
import { ItemTypeSchema, LearningStatusSchema, type ItemType } from './enums.js';

/**
 * Type-specific extras for each learning item. The shared fields (headword, meanings) live on the
 * item itself; the payload only holds what differs per type. One table, many shapes.
 */
const examples = z.array(z.string().trim().min(1).max(300)).max(8).default([]);

export const VocabularyPayloadSchema = z.object({
  partOfSpeech: z.enum(['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']).optional(),
  ipa: z.string().trim().max(80).optional(),
  examples,
  wordFamily: z
    .array(z.object({ form: z.string().trim().min(1).max(60), pos: z.string().trim().max(30) }))
    .max(12)
    .default([]),
});

export const CollocationPayloadSchema = z.object({
  /** The word the collocation is built around, e.g. "negotiate" for "negotiate a discount". */
  keyword: z.string().trim().max(60).optional(),
  examples,
});

export const GrammarPayloadSchema = z.object({
  structure: z.string().trim().max(200).optional(),
  examples,
  notesFa: z.string().trim().max(2000).optional(),
});

export const ExpressionPayloadSchema = z.object({
  register: z.enum(['neutral', 'formal', 'informal', 'slang']).optional(),
  examples,
});

export const WordFormationPayloadSchema = z.object({
  base: z.string().trim().min(1).max(60),
  forms: z
    .array(
      z.object({
        form: z.string().trim().min(1).max(60),
        pos: z.enum(['noun', 'verb', 'adjective', 'adverb']),
      }),
    )
    .min(1)
    .max(12),
});

export const IrregularVerbPayloadSchema = z.object({
  base: z.string().trim().min(1).max(40),
  past: z.string().trim().min(1).max(60),
  pastParticiple: z.string().trim().min(1).max(60),
});

export const WordDistinctionPayloadSchema = z.object({
  members: z.array(z.string().trim().min(1).max(60)).min(2).max(8),
  distinctions: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(60),
        usageFa: z.string().trim().max(500),
        example: z.string().trim().max(300),
      }),
    )
    .max(8)
    .default([]),
});

export const SentencePatternPayloadSchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  examples,
});

export const PronunciationPayloadSchema = z.object({
  ipa: z.string().trim().max(80).optional(),
  tipFa: z.string().trim().max(500).optional(),
});

export const ITEM_PAYLOAD_SCHEMAS = {
  VOCABULARY: VocabularyPayloadSchema,
  COLLOCATION: CollocationPayloadSchema,
  GRAMMAR: GrammarPayloadSchema,
  EXPRESSION: ExpressionPayloadSchema,
  WORD_FORMATION: WordFormationPayloadSchema,
  IRREGULAR_VERB: IrregularVerbPayloadSchema,
  WORD_DISTINCTION: WordDistinctionPayloadSchema,
  SENTENCE_PATTERN: SentencePatternPayloadSchema,
  PRONUNCIATION: PronunciationPayloadSchema,
} satisfies Record<ItemType, z.ZodType>;

export type ItemPayloads = { [K in ItemType]: z.infer<(typeof ITEM_PAYLOAD_SCHEMAS)[K]> };

/** Validates a payload for its type; returns the cleaned payload or the Zod issues. */
export function parseItemPayload(type: ItemType, payload: unknown) {
  return ITEM_PAYLOAD_SCHEMAS[type].safeParse(payload ?? {});
}

/** Display names and the colour group each type belongs to (see docs/design). */
export const ITEM_TYPE_META: Record<
  ItemType,
  { label: string; plural: string; mode: 'vocabulary' | 'grammar' | 'collocations' | 'formation' | 'expressions' | 'verbs' }
> = {
  VOCABULARY: { label: 'Word', plural: 'Vocabulary', mode: 'vocabulary' },
  COLLOCATION: { label: 'Collocation', plural: 'Collocations', mode: 'collocations' },
  GRAMMAR: { label: 'Grammar point', plural: 'Grammar', mode: 'grammar' },
  EXPRESSION: { label: 'Expression', plural: 'Expressions', mode: 'expressions' },
  WORD_FORMATION: { label: 'Word family', plural: 'Word formation', mode: 'formation' },
  IRREGULAR_VERB: { label: 'Irregular verb', plural: 'Irregular verbs', mode: 'verbs' },
  WORD_DISTINCTION: { label: 'Word distinction', plural: 'Distinctions', mode: 'grammar' },
  SENTENCE_PATTERN: { label: 'Sentence pattern', plural: 'Patterns', mode: 'grammar' },
  PRONUNCIATION: { label: 'Pronunciation', plural: 'Pronunciation', mode: 'vocabulary' },
};

export const CONTENT_SOURCES = ['TEACHER', 'BOOK', 'USER', 'AI_SUGGESTED'] as const;
export const ContentSourceSchema = z.enum(CONTENT_SOURCES);
export type ContentSource = z.infer<typeof ContentSourceSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const itemBase = {
  headword: z.string().trim().min(1, 'Required').max(120),
  meaningEn: optionalText(500).optional(),
  meaningFa: optionalText(500).optional(),
  lessonIds: z.array(z.uuid()).max(20).default([]),
};

/** Payload is validated against its type in `refinePayload`. */
function refinePayload<T extends { type: ItemType; payload: unknown }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  const result = parseItemPayload(value.type, value.payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', path: ['payload', ...issue.path], message: issue.message });
    }
  }
}

export const CreateItemSchema = z
  .object({
    type: ItemTypeSchema,
    ...itemBase,
    payload: z.unknown().default({}),
  })
  .superRefine(refinePayload);
export type CreateItem = z.infer<typeof CreateItemSchema>;

/** For updates the type is read from the stored item, so the payload is validated server-side. */
export const UpdateItemSchema = z
  .object({
    headword: itemBase.headword,
    meaningEn: itemBase.meaningEn,
    meaningFa: itemBase.meaningFa,
    lessonIds: itemBase.lessonIds,
    payload: z.unknown(),
  })
  .partial()
  .strict();
export type UpdateItem = z.infer<typeof UpdateItemSchema>;

export const ItemLessonRefSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  unitNumber: z.number().int(),
  bookId: z.uuid(),
  bookTitle: z.string(),
});
export type ItemLessonRef = z.infer<typeof ItemLessonRefSchema>;

export const ItemSessionRefSchema = z.object({ id: z.uuid(), title: z.string(), classDate: z.string() });
export type ItemSessionRef = z.infer<typeof ItemSessionRefSchema>;

export const ItemSchema = z.object({
  id: z.uuid(),
  type: ItemTypeSchema,
  headword: z.string(),
  meaningEn: z.string().nullable(),
  meaningFa: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  source: ContentSourceSchema,
  lessons: z.array(ItemLessonRefSchema),
  /** Class sessions in which the teacher taught this item. */
  sessions: z.array(ItemSessionRefSchema),
  /** Learning state arrives with the spaced-repetition engine; every item starts as NEW. */
  status: LearningStatusSchema,
  createdAt: z.string(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ItemListQuerySchema = z.object({
  type: ItemTypeSchema.optional(),
  lessonId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  bookId: z.uuid().optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ItemListQuery = z.infer<typeof ItemListQuerySchema>;

export interface ItemListResponse {
  items: Item[];
  nextCursor: string | null;
  /** Counts per type for the current filters (without the type filter), for the tab badges. */
  counts: Partial<Record<ItemType, number>>;
}

export interface SearchResponse {
  query: string;
  results: Item[];
}
