import { describe, expect, it } from 'vitest';
import type { ExerciseFormat } from '@coach/contracts';
import { adaptLevel, type LevelState } from './mastery.js';
import { DIFFICULTY_RULES, rulesFor, usableExercises } from './difficulty.js';

const start = (level: LevelState['currentLevel'] = 'RECOGNITION'): LevelState => ({ currentLevel: level, levelStreak: 0, highestLevelPassed: null });

describe('difficulty rules', () => {
  it('the harder the setting, the higher new items start', () => {
    expect(DIFFICULTY_RULES.EASY.startLevel).toBe('RECOGNITION');
    expect(DIFFICULTY_RULES.STANDARD.startLevel).toBe('RECOGNITION');
    expect(DIFFICULTY_RULES.CHALLENGING.startLevel).toBe('RECALL');
  });

  it('is challenging unless a learner chose otherwise', () => {
    expect(rulesFor(undefined)).toBe(DIFFICULTY_RULES.CHALLENGING);
    expect(rulesFor(null)).toBe(DIFFICULTY_RULES.CHALLENGING);
    expect(rulesFor('EASY')).toBe(DIFFICULTY_RULES.EASY);
  });

  it('only the challenging setting drops flashcards', () => {
    expect(DIFFICULTY_RULES.EASY.selfRated).toBe(true);
    expect(DIFFICULTY_RULES.STANDARD.selfRated).toBe(true);
    expect(DIFFICULTY_RULES.CHALLENGING.selfRated).toBe(false);
  });
});

describe('moving up and down with the setting', () => {
  const run = (answers: boolean[], rules: { promoteAfter: number; demoteAfter: number }, from = start()) =>
    answers.reduce((s, ok) => adaptLevel(s, ok, rules), from);

  it('keeps the old behaviour by default: up after 3, down after 2', () => {
    expect(answersToLevel([true, true])).toBe('RECOGNITION');
    expect(answersToLevel([true, true, true])).toBe('RECALL');
  });

  it('moves up after two right answers on the harder settings', () => {
    const rules = DIFFICULTY_RULES.STANDARD;
    expect(run([true], rules).currentLevel).toBe('RECOGNITION');
    expect(run([true, true], rules).currentLevel).toBe('RECALL');
  });

  it('is more patient about moving down on the challenging setting', () => {
    const rules = DIFFICULTY_RULES.CHALLENGING;
    const from = start('CONTEXT');
    expect(run([false, false], rules, from).currentLevel).toBe('CONTEXT');
    expect(run([false, false, false], rules, from).currentLevel).toBe('RECALL');
    // On the standard setting two wrong answers are enough.
    expect(run([false, false], DIFFICULTY_RULES.STANDARD, from).currentLevel).toBe('RECALL');
  });

  it('never goes above production or below recognition', () => {
    const rules = DIFFICULTY_RULES.STANDARD;
    expect(run([true, true, true, true, true, true, true, true, true, true], rules).currentLevel).toBe('PRODUCTION');
    expect(run([false, false, false, false], rules).currentLevel).toBe('RECOGNITION');
  });

  function answersToLevel(answers: boolean[]) {
    return answers.reduce((s, ok) => adaptLevel(s, ok), start()).currentLevel;
  }
});

describe('usableExercises', () => {
  const e = (format: ExerciseFormat) => ({ format });

  it('keeps everything when self-rated formats are allowed', () => {
    const pool = [e('flashcard'), e('multiple_choice')];
    expect(usableExercises(pool, DIFFICULTY_RULES.EASY)).toHaveLength(2);
  });

  it('drops flashcards on the challenging setting', () => {
    expect(usableExercises([e('flashcard'), e('multiple_choice')], DIFFICULTY_RULES.CHALLENGING)).toEqual([e('multiple_choice')]);
  });

  it('never leaves an item with nothing to practise', () => {
    expect(usableExercises([e('flashcard')], DIFFICULTY_RULES.CHALLENGING)).toEqual([e('flashcard')]);
  });
});
