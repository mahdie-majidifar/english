import { z } from 'zod';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const CefrLevelSchema = z.enum(CEFR_LEVELS);
export type CefrLevel = z.infer<typeof CefrLevelSchema>;

export const ProfileSchema = z.object({
  displayName: z.string(),
  timezone: z.string(),
  englishLevel: CefrLevelSchema.nullable(),
  learningGoal: z.string().nullable(),
  dailyGoalMinutes: z.number().int(),
  sessionMinutes: z.number().int(),
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
  })
  .partial()
  .strict();
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
