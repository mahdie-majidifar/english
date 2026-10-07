import type { ExerciseFormat, ExerciseLevel } from '@coach/contracts';

const LEVELS: ExerciseLevel[] = ['RECOGNITION', 'RECALL', 'CONTEXT', 'PRODUCTION'];

/** The next level up, or the same one at the top. */
export function oneLevelUp(level: ExerciseLevel): ExerciseLevel {
  return LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)]!;
}

/** Levels to try, nearest first, preferring easier over harder when equally close. */
function levelsByDistance(level: ExerciseLevel): ExerciseLevel[] {
  const i = LEVELS.indexOf(level);
  return [...LEVELS].sort((a, b) => {
    const da = Math.abs(LEVELS.indexOf(a) - i);
    const db = Math.abs(LEVELS.indexOf(b) - i);
    return da - db || LEVELS.indexOf(a) - LEVELS.indexOf(b);
  });
}

/**
 * Picks one exercise for a target level. Falls back to the nearest level that has any, and avoids
 * repeating the formats the learner just saw, so a session does not feel samey.
 */
export function chooseExercise<T extends { level: ExerciseLevel; format: ExerciseFormat }>(
  candidates: readonly T[],
  level: ExerciseLevel,
  recentFormats: readonly ExerciseFormat[],
  rng: () => number,
  /** Never go harder than this, so a new item is not thrown straight into production. */
  maxLevel: ExerciseLevel = 'PRODUCTION',
  /** Exercises answered recently: still allowed, but only when nothing fresher fits the level. */
  isRecent: (candidate: T) => boolean = () => false,
): T | null {
  for (const l of levelsByDistance(level)) {
    if (LEVELS.indexOf(l) > LEVELS.indexOf(maxLevel)) continue;
    const atLevel = candidates.filter((c) => c.level === l);
    if (atLevel.length === 0) continue;
    // Level fit always wins; within a level, prefer new questions in formats not just seen.
    const preferences = [
      atLevel.filter((c) => !isRecent(c) && !recentFormats.includes(c.format)),
      atLevel.filter((c) => !isRecent(c)),
      atLevel.filter((c) => !recentFormats.includes(c.format)),
      atLevel,
    ];
    const pool = preferences.find((p) => p.length > 0)!;
    return pool[Math.floor(rng() * pool.length)]!;
  }
  return null;
}
