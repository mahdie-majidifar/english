import { z } from 'zod';
import { ItemTypeSchema, type ItemType } from './enums.js';
import { parseItemPayload } from './content.js';

export const MATERIAL_CATEGORIES = ['CLASS_NOTES', 'EXERCISE', 'HANDOUT'] as const;
export const MaterialCategorySchema = z.enum(MATERIAL_CATEGORIES);
export type MaterialCategory = z.infer<typeof MaterialCategorySchema>;

export const INGESTION_STATUSES = [
  'UPLOADED',
  'EXTRACTING',
  'PARSING',
  'AWAITING_REVIEW',
  'COMMITTED',
  'FAILED',
  'DISCARDED',
] as const;
export const IngestionStatusSchema = z.enum(INGESTION_STATUSES);
export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;

/** Statuses where the pipeline is still working and the UI should keep polling. */
export const IN_PROGRESS_STATUSES: readonly IngestionStatus[] = ['UPLOADED', 'EXTRACTING', 'PARSING'];

export const ALLOWED_UPLOAD_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/plain': 'txt',
} as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

// ───────────── Teacher sessions ─────────────

export const CreateTeacherSessionSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(120),
  classDate: z.iso.date(),
  lessonId: z.uuid().nullable().optional(),
});
export type CreateTeacherSession = z.infer<typeof CreateTeacherSessionSchema>;

export const CreateTextMaterialSchema = z.object({
  text: z.string().trim().min(1, 'Paste your notes first.').max(60_000),
  title: z.string().trim().max(120).optional(),
  category: MaterialCategorySchema.default('CLASS_NOTES'),
});
export type CreateTextMaterial = z.infer<typeof CreateTextMaterialSchema>;

// ───────────── What the AI proposes, and what the learner confirms ─────────────

export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE);

const POS_ANY = z.enum(['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']);

/**
 * One proposed learning item. Every field is always present (nullable instead of optional) so the
 * same shape can be used as a strict structured-output schema for the AI provider.
 */
export const DraftItemSchema = z.object({
  type: ItemTypeSchema,
  headword: z.string().trim().min(1).max(120),
  meaningEn: z.string().trim().max(500).nullable(),
  meaningFa: z.string().trim().max(500).nullable(),
  partOfSpeech: POS_ANY.nullable(),
  examples: z.array(z.string().trim().max(300)).max(8),
  /** Irregular verbs. */
  past: z.string().trim().max(60).nullable(),
  pastParticiple: z.string().trim().max(60).nullable(),
  /** Word distinctions: the words being compared. */
  members: z.array(z.string().trim().max(60)).max(8),
  /** Word formation: related forms of the headword. */
  forms: z
    .array(z.object({ form: z.string().trim().max(60), pos: z.enum(['noun', 'verb', 'adjective', 'adverb']) }))
    .max(12),
  /** Grammar points and sentence patterns. */
  structure: z.string().trim().max(200).nullable(),
  confidence: ConfidenceSchema,
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const DRAFT_EXERCISE_SKILLS = [
  'VOCABULARY',
  'GRAMMAR',
  'COLLOCATION',
  'WORD_FORMATION',
  'EXPRESSION',
  'WRITING',
  'READING',
] as const;

export const DraftExerciseSchema = z.object({
  /** The teacher's exercise, word for word. It is never rewritten. */
  originalText: z.string().trim().min(1).max(4000),
  skill: z.enum(DRAFT_EXERCISE_SKILLS),
  topic: z.string().trim().max(120).nullable(),
});
export type DraftExercise = z.infer<typeof DraftExerciseSchema>;

/** The AI's complete answer for one material. */
export const ParsedMaterialSchema = z.object({
  summary: z.string().trim().max(300),
  items: z.array(DraftItemSchema).max(300),
  exercises: z.array(DraftExerciseSchema).max(100),
});
export type ParsedMaterial = z.infer<typeof ParsedMaterialSchema>;

export const CommitMaterialSchema = z.object({
  items: z.array(DraftItemSchema).max(300),
  exercises: z.array(DraftExerciseSchema).max(100),
});
export type CommitMaterial = z.infer<typeof CommitMaterialSchema>;

/** Turns a draft into the payload stored on a learning item. */
export function draftItemPayload(draft: DraftItem): Record<string, unknown> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
  const examples = draft.examples.map((e) => e.trim()).filter(Boolean);
  switch (draft.type) {
    case 'VOCABULARY':
      return { partOfSpeech: draft.partOfSpeech ?? undefined, examples };
    case 'COLLOCATION':
      return { examples };
    case 'GRAMMAR':
      return { structure: clean(draft.structure), examples };
    case 'EXPRESSION':
      return { examples };
    case 'WORD_FORMATION':
      return { base: draft.headword.trim(), forms: draft.forms };
    case 'IRREGULAR_VERB':
      return { base: draft.headword.trim(), past: clean(draft.past), pastParticiple: clean(draft.pastParticiple) };
    case 'WORD_DISTINCTION':
      return { members: draft.members.map((m) => m.trim()).filter(Boolean), distinctions: [] };
    case 'SENTENCE_PATTERN':
      return { pattern: clean(draft.structure) ?? draft.headword.trim(), examples };
    case 'PRONUNCIATION':
      return {};
  }
}

/** Why a draft cannot be saved yet, or null when it is complete. Used by both the review UI and the commit. */
export function draftItemProblem(draft: DraftItem): string | null {
  if (!draft.headword.trim()) return 'Missing word';
  const result = parseItemPayload(draft.type, draftItemPayload(draft));
  if (result.success) return null;
  switch (draft.type) {
    case 'IRREGULAR_VERB':
      return 'Needs the past simple and past participle';
    case 'WORD_FORMATION':
      return 'Needs at least one related form';
    case 'WORD_DISTINCTION':
      return 'Needs at least two words to compare';
    default:
      return 'Some details are missing';
  }
}

export function emptyDraftItem(type: ItemType, headword = ''): DraftItem {
  return {
    type,
    headword,
    meaningEn: null,
    meaningFa: null,
    partOfSpeech: null,
    examples: [],
    past: null,
    pastParticiple: null,
    members: [],
    forms: [],
    structure: null,
    confidence: 'high',
  };
}

// ───────────── Responses ─────────────

export interface DraftItemDto extends DraftItem {
  /** True when an item with the same word and type is already in the library. */
  known: boolean;
}

export interface MaterialDto {
  id: string;
  sessionId: string | null;
  title: string;
  category: MaterialCategory;
  status: IngestionStatus;
  errorMessage: string | null;
  fileName: string | null;
  mimeType: string | null;
  /** The original pasted text, shown next to the draft. Present for pasted notes and extracted files. */
  originalText: string | null;
  createdAt: string;
  draft: { summary: string; items: DraftItemDto[]; exercises: DraftExercise[] } | null;
}

export interface TeacherSessionSummary {
  id: string;
  title: string;
  classDate: string;
  lesson: { id: string; code: string; title: string } | null;
  materialCount: number;
  itemCount: number;
  /** Status of the newest material, so the list can show "Needs review". */
  latestStatus: IngestionStatus | null;
}

export interface TeacherSessionDetail extends Omit<TeacherSessionSummary, 'latestStatus'> {
  materials: Pick<MaterialDto, 'id' | 'title' | 'category' | 'status' | 'errorMessage' | 'fileName' | 'createdAt'>[];
}

export interface CommitResult {
  created: number;
  merged: number;
  skipped: { headword: string; reason: string }[];
  exercises: number;
}
