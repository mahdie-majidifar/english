import type { ExerciseLevel, Verdict } from '@coach/contracts';
import { addDays } from '../time.js';

const CORRECT_XP: Record<ExerciseLevel, number> = { RECOGNITION: 5, RECALL: 8, CONTEXT: 12, PRODUCTION: 15 };

/** Harder exercises are worth more. A wrong answer still earns 1 XP: trying counts. */
export function xpForAttempt(input: { verdict: Verdict; level: ExerciseLevel }): number {
  if (input.verdict === 'wrong') return 1;
  const base = CORRECT_XP[input.level];
  return input.verdict === 'almost' ? Math.max(1, Math.round(base * 0.6)) : base;
}

export const SESSION_COMPLETE_XP = 30;
export const SESSION_PERFECT_BONUS_XP = 20;
export const DAILY_GOAL_XP = 20;

export function xpForSession(input: { answered: number; wrong: number }): number {
  if (input.answered === 0) return 0;
  return SESSION_COMPLETE_XP + (input.wrong === 0 ? SESSION_PERFECT_BONUS_XP : 0);
}

/** XP needed in total to reach level n+1 is 50 x n x (n+1): 100, 300, 600, 1000, ... */
const threshold = (n: number) => 50 * n * (n + 1);

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level takes in total. */
  xpForLevel: number;
}

export function levelForXp(totalXp: number): LevelProgress {
  let level = 1;
  while (threshold(level) <= totalXp) level++;
  const start = level === 1 ? 0 : threshold(level - 1);
  return { level, xpIntoLevel: totalXp - start, xpForLevel: threshold(level) - start };
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** Local date (YYYY-MM-DD) of the last day that counted. */
  lastStreakDate: string | null;
}

/**
 * A day counts once the learner reaches the daily goal. Consecutive counted days build the streak;
 * missing a whole day starts it again from 1. Dates are the learner's own local days.
 */
export function advanceStreak(state: StreakState, today: string, goalMet: boolean): StreakState {
  if (!goalMet || state.lastStreakDate === today) return state;
  const continues = state.lastStreakDate === addDays(today, -1);
  const currentStreak = continues ? state.currentStreak + 1 : 1;
  return { currentStreak, longestStreak: Math.max(state.longestStreak, currentStreak), lastStreakDate: today };
}

/** The streak to show: it is still alive today or yesterday, and over once a whole day was missed. */
export function visibleStreak(state: StreakState, today: string): number {
  if (!state.lastStreakDate) return 0;
  return state.lastStreakDate === today || state.lastStreakDate === addDays(today, -1) ? state.currentStreak : 0;
}
