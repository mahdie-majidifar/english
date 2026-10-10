import type { Difficulty, ExerciseLevel } from '@coach/contracts';

/**
 * What each difficulty setting changes. Nothing else in the app knows the numbers.
 *
 *  - startLevel:      where a brand-new item begins. Recognition is "pick the meaning"; recall
 *                     means producing the word yourself.
 *  - promoteAfter:    right answers in a row before an item moves up a level.
 *  - demoteAfter:     wrong answers in a row before it moves back down.
 *  - selfRated:       whether flashcards ("I think I knew it") are used. They teach little, so
 *                     the harder settings leave them out.
 */
export interface DifficultyRules {
  startLevel: ExerciseLevel;
  promoteAfter: number;
  demoteAfter: number;
  selfRated: boolean;
}

export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRules> = {
  EASY: { startLevel: 'RECOGNITION', promoteAfter: 3, demoteAfter: 2, selfRated: true },
  STANDARD: { startLevel: 'RECOGNITION', promoteAfter: 2, demoteAfter: 2, selfRated: true },
  CHALLENGING: { startLevel: 'RECALL', promoteAfter: 2, demoteAfter: 3, selfRated: false },
};

export const DEFAULT_DIFFICULTY: Difficulty = 'CHALLENGING';

export const rulesFor = (difficulty: Difficulty | null | undefined): DifficultyRules =>
  DIFFICULTY_RULES[difficulty ?? DEFAULT_DIFFICULTY];

/** Formats where the learner marks themselves. Not allowed in quizzes and exams, whatever the setting. */
export const SELF_RATED_FORMATS: ReadonlySet<string> = new Set<string>(['flashcard']);

/**
 * Drops the formats a setting does not use, but never leaves an item with nothing to practise:
 * if only those formats exist for it, they stay.
 */
export function usableExercises<T extends { format: string }>(pool: readonly T[], rules: DifficultyRules): T[] {
  if (rules.selfRated) return [...pool];
  const kept = pool.filter((e) => !SELF_RATED_FORMATS.has(e.format));
  return kept.length > 0 ? kept : [...pool];
}
