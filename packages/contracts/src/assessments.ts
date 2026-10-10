import { z } from 'zod';
import type { SkillArea } from './enums.js';
import type { AttemptResult, ClientExercise } from './exercises.js';

/**
 * Quizzes and exams are one thing with two settings (see TECHNICAL_PLAN §13-14):
 * a quiz tells you right away whether each answer was right; an exam tells you only at the end.
 */
export const ASSESSMENT_KINDS = ['QUIZ', 'EXAM'] as const;
export const AssessmentKindSchema = z.enum(ASSESSMENT_KINDS);
export type AssessmentKind = z.infer<typeof AssessmentKindSchema>;

/** What an assessment covers. */
export const ASSESSMENT_PRESETS = ['LESSON', 'UNIT', 'WEAK_AREAS', 'WEEKLY', 'MONTHLY'] as const;
export const AssessmentPresetSchema = z.enum(ASSESSMENT_PRESETS);
export type AssessmentPreset = z.infer<typeof AssessmentPresetSchema>;

export const ASSESSMENT_STATUSES = ['READY', 'IN_PROGRESS', 'GRADED'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export type FeedbackMode = 'IMMEDIATE' | 'END';

export const PRESET_LABELS: Record<AssessmentPreset, string> = {
  LESSON: 'Current lesson',
  UNIT: 'Current unit',
  WEAK_AREAS: 'Weak areas',
  WEEKLY: 'Last 7 days',
  MONTHLY: 'Last 30 days',
};

/** Which presets each kind offers, in the order the page shows them. */
export const KIND_PRESETS: Record<AssessmentKind, AssessmentPreset[]> = {
  QUIZ: ['LESSON', 'UNIT', 'WEAK_AREAS', 'WEEKLY'],
  EXAM: ['LESSON', 'UNIT', 'WEEKLY', 'MONTHLY'],
};

export const CreateAssessmentSchema = z
  .object({ kind: AssessmentKindSchema, preset: AssessmentPresetSchema })
  .strict()
  .refine((v) => KIND_PRESETS[v.kind].includes(v.preset), { message: 'This preset is not available for this kind.', path: ['preset'] });
export type CreateAssessment = z.infer<typeof CreateAssessmentSchema>;

export const AnswerAssessmentSchema = z
  .object({
    response: z.unknown(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();
export type AnswerAssessment = z.infer<typeof AnswerAssessmentSchema>;

export interface AssessmentSummaryDto {
  id: string;
  kind: AssessmentKind;
  preset: AssessmentPreset;
  title: string;
  status: AssessmentStatus;
  questionCount: number;
  timeLimitSec: number | null;
  /** 0..1, once graded. */
  score: number | null;
  xpEarned: number;
  createdAt: string;
  gradedAt: string | null;
}

export interface AssessmentQuestionDto {
  id: string;
  position: number;
  exercise: ClientExercise;
  /** Saved already: a quiz answer has been checked, an exam answer has been stored. */
  answered: boolean;
}

/** What the player needs. It never contains an answer key. */
export interface AssessmentDto {
  id: string;
  kind: AssessmentKind;
  preset: AssessmentPreset;
  title: string;
  status: AssessmentStatus;
  feedback: FeedbackMode;
  timeLimitSec: number | null;
  startedAt: string | null;
  /** When the server stops taking answers. Compare with `serverNow`, not the learner's clock. */
  expiresAt: string | null;
  serverNow: string;
  /** Empty once graded: the result has the review. */
  questions: AssessmentQuestionDto[];
}

/** A quiz answer comes back checked; an exam answer comes back only as "saved". */
export interface AnswerSavedDto {
  saved: true;
  result: AttemptResult | null;
}

export interface SkillBreakdown {
  skill: SkillArea;
  label: string;
  /** 0..1 */
  score: number;
  correct: number;
  total: number;
}

export interface ReviewQuestionDto {
  position: number;
  exercise: ClientExercise;
  answered: boolean;
  verdict: 'correct' | 'almost' | 'wrong' | null;
  /** Written out for the screen, in the learner's words. */
  yourAnswer: string | null;
  correctAnswerText: string | null;
  explanationFa: string | null;
  errorLabels: string[];
}

export interface AssessmentResultDto {
  id: string;
  kind: AssessmentKind;
  preset: AssessmentPreset;
  title: string;
  /** 0..1 over every question, unanswered ones counting as zero. */
  score: number;
  total: number;
  correct: number;
  almost: number;
  wrong: number;
  unanswered: number;
  xpEarned: number;
  durationSec: number;
  breakdown: SkillBreakdown[];
  /** Mistakes this assessment added or repeated. */
  newMistakes: number;
  /** A next step drawn from the weakest skill, or null when everything went well. */
  suggestion: { label: string; href: string } | null;
  review: ReviewQuestionDto[];
  gradedAt: string;
}

export interface AssessmentRecommendation {
  preset: AssessmentPreset;
  reason: string;
}

export interface AssessmentListDto {
  assessments: AssessmentSummaryDto[];
  recommendations: { quiz: AssessmentRecommendation | null; exam: AssessmentRecommendation | null };
}
