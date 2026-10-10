import { z } from 'zod';

/**
 * A short lesson about one item, in Persian with English examples. Written by the AI on request
 * and kept, so asking again costs nothing. Every field is always present so the same shape can be
 * the AI's strict output schema.
 */
export const ExplanationSchema = z.object({
  overviewFa: z.string().trim().min(1).max(1200),
  keyPoints: z.array(z.string().trim().min(1).max(300)).max(6),
  examples: z.array(z.object({ en: z.string().trim().min(1).max(300), fa: z.string().trim().min(1).max(300) })).max(5),
  commonMistakes: z
    .array(z.object({ wrong: z.string().trim().min(1).max(200), right: z.string().trim().min(1).max(200), noteFa: z.string().trim().max(300) }))
    .max(4),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export interface ExplanationResponse {
  explanation: Explanation | null;
}

// ───────────── Filling a lesson with AI suggestions ─────────────

export const SUGGEST_FOCUS = ['MIXED', 'VOCABULARY', 'GRAMMAR', 'COLLOCATION'] as const;
export const SuggestFocusSchema = z.enum(SUGGEST_FOCUS);
export type SuggestFocus = z.infer<typeof SuggestFocusSchema>;

export const SuggestLessonContentSchema = z
  .object({
    /** What the lesson is about. Needed when the lesson only has a neutral name such as "Lesson B". */
    topic: z.string().trim().min(2).max(120).optional(),
    focus: SuggestFocusSchema.default('MIXED'),
  })
  .strict();
export type SuggestLessonContent = z.infer<typeof SuggestLessonContentSchema>;

export interface SuggestLessonContentResult {
  /** The suggestions wait here for the learner to review. Nothing is saved to the library yet. */
  materialId: string;
  itemCount: number;
}

// ───────────── What the Learn screen is about ─────────────

export const LearnContextQuerySchema = z
  .object({ lessonId: z.uuid().optional(), unitId: z.uuid().optional() })
  .refine((v) => Boolean(v.lessonId) !== Boolean(v.unitId), { message: 'Choose a lesson or a unit.', path: ['lessonId'] });
export type LearnContextQuery = z.infer<typeof LearnContextQuerySchema>;

export interface LearnContextDto {
  kind: 'lesson' | 'unit';
  /** "8B · Business" or "Unit 8 · Money". */
  title: string;
  /** The book it belongs to. */
  subtitle: string;
  bookId: string;
  lessonId: string | null;
  unitId: string;
  itemCount: number;
  /** True when the lesson has only a neutral name, so the AI will need to be told the topic. */
  needsTopic: boolean;
}
