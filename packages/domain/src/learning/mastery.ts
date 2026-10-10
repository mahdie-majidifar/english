import type { ExerciseLevel, LearningStatus } from '@coach/contracts';

const LEVELS: ExerciseLevel[] = ['RECOGNITION', 'RECALL', 'CONTEXT', 'PRODUCTION'];
const rank = (l: ExerciseLevel | null): number => (l ? LEVELS.indexOf(l) : -1);

/**
 * How well an item is known, 0..1, from three things:
 *  - memory:   how stable the memory is (30 days of stability counts as full)
 *  - accuracy: how often recent answers were right
 *  - level:    how hard the exercises are that the learner has passed
 * Passing only recognition exercises can never reach "mastered": the level caps the result.
 */
const LEVEL_SCORE: Record<ExerciseLevel, number> = { RECOGNITION: 0.25, RECALL: 0.5, CONTEXT: 0.75, PRODUCTION: 1 };
const LEVEL_CAP: Record<ExerciseLevel, number> = { RECOGNITION: 0.4, RECALL: 0.6, CONTEXT: 0.85, PRODUCTION: 1 };
const NO_LEVEL_CAP = 0.25;

export function computeMastery(input: {
  stability: number;
  accuracyEwma: number;
  highestLevelPassed: ExerciseLevel | null;
}): number {
  const memory = Math.min(1, Math.max(0, input.stability) / 30);
  const accuracy = Math.min(1, Math.max(0, input.accuracyEwma));
  const level = input.highestLevelPassed;
  const levelScore = level ? LEVEL_SCORE[level] : 0;
  const cap = level ? LEVEL_CAP[level] : NO_LEVEL_CAP;
  return Math.min(cap, 0.45 * memory + 0.35 * accuracy + 0.2 * levelScore);
}

/** Recent accuracy as an exponential moving average. The first answer sets it. */
export function updateAccuracy(previous: number, score: number, reps: number): number {
  if (reps === 0) return score;
  return previous * 0.7 + score * 0.3;
}

export interface LevelState {
  currentLevel: ExerciseLevel;
  /** Positive: right answers in a row at this level. Negative: wrong answers in a row. */
  levelStreak: number;
  highestLevelPassed: ExerciseLevel | null;
}

/**
 * Adaptive difficulty. Three right answers in a row move the item up a level; two wrong answers in
 * a row move it back down (so the learner returns to easier exercises and explanations).
 */
export function adaptLevel(
  state: LevelState,
  isCorrect: boolean,
  /** How many in a row move the item. The difficulty setting chooses these. */
  thresholds: { promoteAfter: number; demoteAfter: number } = { promoteAfter: 3, demoteAfter: 2 },
  /** How much a right answer counts toward moving up. An exam answer counts double: it proves more. */
  weight = 1,
): LevelState {
  let { currentLevel, levelStreak, highestLevelPassed } = state;

  if (isCorrect) {
    if (rank(currentLevel) > rank(highestLevelPassed)) highestLevelPassed = currentLevel;
    levelStreak = Math.max(levelStreak, 0) + weight;
    if (levelStreak >= thresholds.promoteAfter && rank(currentLevel) < LEVELS.length - 1) {
      currentLevel = LEVELS[rank(currentLevel) + 1]!;
      levelStreak = 0;
    }
  } else {
    levelStreak = Math.min(levelStreak, 0) - 1;
    if (levelStreak <= -thresholds.demoteAfter && rank(currentLevel) > 0) {
      currentLevel = LEVELS[rank(currentLevel) - 1]!;
      levelStreak = 0;
    }
  }
  return { currentLevel, levelStreak, highestLevelPassed };
}

export interface StatusInput {
  reps: number;
  stability: number;
  mastery: number;
  highestLevelPassed: ExerciseLevel | null;
}

/**
 * New -> Learning -> Review -> Mastered. "Weak" is not a status: it is a flag (see `isWeakItem`)
 * that can apply on top of Learning or Review.
 */
export function statusFor(input: StatusInput): LearningStatus {
  if (input.reps === 0) return 'NEW';
  if (input.mastery >= 0.85 && input.stability >= 21 && rank(input.highestLevelPassed) >= rank('CONTEXT')) return 'MASTERED';
  if (input.stability < 3) return 'LEARNING';
  return 'REVIEW';
}

export function isWeakItem(input: {
  reps: number;
  lapses: number;
  accuracyEwma: number;
  hasSeriousMistake: boolean;
}): boolean {
  return input.lapses >= 3 || (input.reps >= 3 && input.accuracyEwma < 0.6) || input.hasSeriousMistake;
}
