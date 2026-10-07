import { z } from 'zod';

export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ITEM_TYPES = [
  'VOCABULARY',
  'COLLOCATION',
  'GRAMMAR',
  'EXPRESSION',
  'WORD_FORMATION',
  'IRREGULAR_VERB',
  'WORD_DISTINCTION',
  'SENTENCE_PATTERN',
  'PRONUNCIATION',
] as const;
export const ItemTypeSchema = z.enum(ITEM_TYPES);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const SKILL_AREAS = [
  'VOCABULARY',
  'GRAMMAR',
  'COLLOCATION',
  'WORD_FORMATION',
  'EXPRESSION',
  'WRITING',
  'SPEAKING',
  'LISTENING',
  'READING',
  'PRONUNCIATION',
] as const;
export const SkillAreaSchema = z.enum(SKILL_AREAS);
export type SkillArea = z.infer<typeof SkillAreaSchema>;

/** Easy / Medium / Hard / Production in the PRD. */
export const EXERCISE_LEVELS = ['RECOGNITION', 'RECALL', 'CONTEXT', 'PRODUCTION'] as const;
export const ExerciseLevelSchema = z.enum(EXERCISE_LEVELS);
export type ExerciseLevel = z.infer<typeof ExerciseLevelSchema>;

export const LEARNING_STATUSES = ['NEW', 'LEARNING', 'REVIEW', 'MASTERED'] as const;
export const LearningStatusSchema = z.enum(LEARNING_STATUSES);
export type LearningStatus = z.infer<typeof LearningStatusSchema>;
