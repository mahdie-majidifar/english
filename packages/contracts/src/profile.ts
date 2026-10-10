import { z } from 'zod';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const CefrLevelSchema = z.enum(CEFR_LEVELS);
export type CefrLevel = z.infer<typeof CefrLevelSchema>;

/**
 * How hard the exercises are. Harder settings start new items at a higher level, move them up
 * sooner, and leave out flashcards (where you only mark yourself).
 */
export const DIFFICULTIES = ['EASY', 'STANDARD', 'CHALLENGING'] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; body: string; bodyFa: string }> = {
  EASY: {
    label: 'Easy',
    body: 'New words start with picking the meaning. Flashcards are included. You move up after 3 right answers in a row.',
    bodyFa: 'شروع با انتخاب معنی. فلش‌کارت هم هست. بعد از ۳ جواب درست پشت‌سرهم سخت‌تر می‌شود.',
  },
  STANDARD: {
    label: 'Standard',
    body: 'New words start with picking the meaning, then get harder quickly: you move up after 2 right answers in a row.',
    bodyFa: 'شروع با انتخاب معنی، بعد سریع‌تر سخت می‌شود (بعد از ۲ جواب درست).',
  },
  CHALLENGING: {
    label: 'Challenging',
    body: 'New words start with recalling and typing them yourself. No flashcards. You move up after 2 right answers.',
    bodyFa: 'از همان اول باید کلمه را خودت یادآوری و تایپ کنی. بدون فلش‌کارت. بعد از ۲ جواب درست سخت‌تر می‌شود.',
  },
};

export const ProfileSchema = z.object({
  displayName: z.string(),
  timezone: z.string(),
  englishLevel: CefrLevelSchema.nullable(),
  learningGoal: z.string().nullable(),
  dailyGoalMinutes: z.number().int(),
  sessionMinutes: z.number().int(),
  difficulty: DifficultySchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

export const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    timezone: z.string().min(1).max(64),
    englishLevel: CefrLevelSchema.nullable(),
    learningGoal: z.string().trim().max(300).nullable(),
    dailyGoalMinutes: z.number().int().min(5).max(180),
    sessionMinutes: z.number().int().min(5).max(60),
    difficulty: DifficultySchema,
  })
  .partial()
  .strict();
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
