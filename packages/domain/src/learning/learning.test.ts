import { describe, expect, it } from 'vitest';
import { adaptLevel, computeMastery, isWeakItem, statusFor, updateAccuracy, type LevelState } from './mastery.js';
import { afterCorrect, afterError, describeResponse, mistakePriority, severityOf, isRepeated } from './mistakes.js';
import { advanceStreak, levelForXp, visibleStreak, xpForAttempt, xpForSession } from './gamification.js';
import { emptySrs, ratingFor, retrievability, reviewCard } from './srs.js';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 10, 0, 0));

describe('spaced repetition (FSRS)', () => {
  it('schedules a first correct answer for a later day, not minutes later', () => {
    const next = reviewCard(null, 3, day(0));
    expect(next.reps).toBe(1);
    expect(next.due!.getTime() - day(0).getTime()).toBeGreaterThanOrEqual(86_400_000);
    expect(next.stability).toBeGreaterThan(0);
  });

  it('spaces reviews further apart as the learner keeps answering correctly', () => {
    let state = reviewCard(null, 3, day(0));
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const now = state.due!;
      const next = reviewCard(state, 3, now);
      gaps.push(next.due!.getTime() - now.getTime());
      state = next;
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
  });

  it('brings an item back sooner after a mistake, and counts the lapse', () => {
    let good = reviewCard(null, 3, day(0));
    good = reviewCard(good, 3, good.due!);
    const when = good.due!;
    const afterGood = reviewCard(good, 3, when);
    const afterAgain = reviewCard(good, 1, when);
    expect(afterAgain.due!.getTime()).toBeLessThan(afterGood.due!.getTime());
    expect(afterAgain.lapses).toBe(good.lapses + 1);
    expect(afterAgain.stability).toBeLessThan(afterGood.stability);
  });

  it('never changes the state it was given', () => {
    const state = reviewCard(null, 3, day(0));
    const copy = JSON.stringify(state);
    reviewCard(state, 1, day(5));
    expect(JSON.stringify(state)).toBe(copy);
  });

  it('retrievability falls with time and is zero for new items', () => {
    const state = reviewCard(null, 3, day(0));
    expect(retrievability(null, day(1))).toBe(0);
    expect(retrievability(emptySrs(), day(1))).toBe(0);
    const soon = retrievability(state, day(1));
    const later = retrievability(state, day(60));
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(later).toBeGreaterThanOrEqual(0);
  });
});

describe('ratingFor', () => {
  const base = { hintsUsed: 0, level: 'RECALL' as const, estimatedSeconds: 20, durationMs: 15_000 };

  it('maps outcomes to ratings', () => {
    expect(ratingFor({ ...base, verdict: 'wrong' })).toBe(1);
    expect(ratingFor({ ...base, verdict: 'almost' })).toBe(2);
    expect(ratingFor({ ...base, verdict: 'correct', hintsUsed: 1 })).toBe(2);
    expect(ratingFor({ ...base, verdict: 'correct' })).toBe(3);
  });

  it('calls a quick right answer at a harder level Easy, but not at recognition level', () => {
    expect(ratingFor({ ...base, verdict: 'correct', level: 'CONTEXT', durationMs: 5_000 })).toBe(4);
    expect(ratingFor({ ...base, verdict: 'correct', level: 'RECOGNITION', durationMs: 2_000 })).toBe(3);
    expect(ratingFor({ ...base, verdict: 'correct', level: 'CONTEXT', durationMs: null })).toBe(3);
  });

  it('uses a flashcard self-rating as it is', () => {
    expect(ratingFor({ ...base, verdict: 'correct', selfRating: 2 })).toBe(2);
    expect(ratingFor({ ...base, verdict: 'wrong', selfRating: 4 })).toBe(4);
  });
});

describe('mastery', () => {
  it('cannot reach mastery by recognising alone', () => {
    const m = computeMastery({ stability: 365, accuracyEwma: 1, highestLevelPassed: 'RECOGNITION' });
    expect(m).toBeLessThanOrEqual(0.4);
    expect(computeMastery({ stability: 365, accuracyEwma: 1, highestLevelPassed: null })).toBeLessThanOrEqual(0.25);
  });

  it('grows with stability, accuracy and level', () => {
    const low = computeMastery({ stability: 2, accuracyEwma: 0.6, highestLevelPassed: 'RECALL' });
    const high = computeMastery({ stability: 28, accuracyEwma: 0.95, highestLevelPassed: 'PRODUCTION' });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('keeps a moving average of accuracy', () => {
    expect(updateAccuracy(0, 1, 0)).toBe(1); // the first answer sets it
    expect(updateAccuracy(1, 0, 4)).toBeCloseTo(0.7);
    expect(updateAccuracy(0.5, 1, 4)).toBeCloseTo(0.65);
  });
});

describe('adaptLevel', () => {
  const start: LevelState = { currentLevel: 'RECOGNITION', levelStreak: 0, highestLevelPassed: null };

  it('moves up after three right answers in a row', () => {
    let s = adaptLevel(start, true);
    expect(s).toMatchObject({ currentLevel: 'RECOGNITION', levelStreak: 1, highestLevelPassed: 'RECOGNITION' });
    s = adaptLevel(adaptLevel(s, true), true);
    expect(s).toMatchObject({ currentLevel: 'RECALL', levelStreak: 0, highestLevelPassed: 'RECOGNITION' });
  });

  it('moves down after two wrong answers in a row, and a right answer breaks a wrong streak', () => {
    const atContext: LevelState = { currentLevel: 'CONTEXT', levelStreak: 0, highestLevelPassed: 'RECALL' };
    expect(adaptLevel(atContext, false).currentLevel).toBe('CONTEXT');
    expect(adaptLevel(adaptLevel(atContext, false), false)).toMatchObject({ currentLevel: 'RECALL', levelStreak: 0 });
    const mixed = adaptLevel(adaptLevel(atContext, false), true);
    expect(mixed.levelStreak).toBe(1);
    expect(mixed.currentLevel).toBe('CONTEXT');
  });

  it('stays within the four levels', () => {
    let s: LevelState = { currentLevel: 'PRODUCTION', levelStreak: 2, highestLevelPassed: 'PRODUCTION' };
    s = adaptLevel(s, true);
    expect(s.currentLevel).toBe('PRODUCTION');
    s = { currentLevel: 'RECOGNITION', levelStreak: -1, highestLevelPassed: null };
    expect(adaptLevel(s, false).currentLevel).toBe('RECOGNITION');
  });

  it('remembers the highest level ever passed', () => {
    const s = adaptLevel({ currentLevel: 'RECALL', levelStreak: 0, highestLevelPassed: 'CONTEXT' }, true);
    expect(s.highestLevelPassed).toBe('CONTEXT');
  });
});

describe('status and weakness', () => {
  it('walks New, Learning, Review, Mastered', () => {
    expect(statusFor({ reps: 0, stability: 0, mastery: 0, highestLevelPassed: null })).toBe('NEW');
    expect(statusFor({ reps: 1, stability: 1.5, mastery: 0.2, highestLevelPassed: 'RECOGNITION' })).toBe('LEARNING');
    expect(statusFor({ reps: 4, stability: 8, mastery: 0.5, highestLevelPassed: 'RECALL' })).toBe('REVIEW');
    expect(statusFor({ reps: 9, stability: 30, mastery: 0.9, highestLevelPassed: 'CONTEXT' })).toBe('MASTERED');
  });

  it('does not call an item mastered if only easy exercises were passed', () => {
    expect(statusFor({ reps: 9, stability: 30, mastery: 0.9, highestLevelPassed: 'RECALL' })).toBe('REVIEW');
  });

  it('flags weak items by lapses, low accuracy or a serious mistake', () => {
    const ok = { reps: 5, lapses: 0, accuracyEwma: 0.9, hasSeriousMistake: false };
    expect(isWeakItem(ok)).toBe(false);
    expect(isWeakItem({ ...ok, lapses: 3 })).toBe(true);
    expect(isWeakItem({ ...ok, accuracyEwma: 0.5 })).toBe(true);
    expect(isWeakItem({ ...ok, hasSeriousMistake: true })).toBe(true);
    expect(isWeakItem({ ...ok, reps: 2, accuracyEwma: 0.2 })).toBe(false); // too few answers to judge
  });
});

describe('mistakes', () => {
  it('ranks serious, repeated and recent mistakes first', () => {
    const grammar = severityOf('GRAMMAR.BACKSHIFT');
    const spelling = severityOf('SPELLING.SPELLING');
    expect(grammar).toBeGreaterThan(spelling);
    const fresh = mistakePriority({ severity: grammar, occurrencesLast30Days: 4, daysSinceLast: 0 });
    const old = mistakePriority({ severity: grammar, occurrencesLast30Days: 4, daysSinceLast: 28 });
    const rare = mistakePriority({ severity: grammar, occurrencesLast30Days: 1, daysSinceLast: 0 });
    const minor = mistakePriority({ severity: spelling, occurrencesLast30Days: 4, daysSinceLast: 0 });
    expect(fresh).toBeGreaterThan(old);
    expect(fresh).toBeGreaterThan(rare);
    expect(fresh).toBeGreaterThan(minor);
    expect(old).toBeCloseTo(fresh / 4, 5); // two half-lives
  });

  it('marks three or more in two weeks as repeated', () => {
    expect(isRepeated(2)).toBe(false);
    expect(isRepeated(3)).toBe(true);
  });

  it('is fixed after right answers on three different days, not three in one day', () => {
    let m = afterError();
    expect(m).toEqual({ status: 'ACTIVE', correctDays: 0, lastCorrectDate: null });
    m = afterCorrect(m, '2026-01-01');
    expect(m).toMatchObject({ status: 'IMPROVING', correctDays: 1 });
    expect(afterCorrect(m, '2026-01-01')).toBe(m); // same day does not count again
    m = afterCorrect(m, '2026-01-02');
    expect(m.status).toBe('IMPROVING');
    m = afterCorrect(m, '2026-01-04');
    expect(m).toMatchObject({ status: 'RESOLVED', correctDays: 3 });
    expect(afterCorrect(m, '2026-01-09')).toBe(m); // stays resolved
  });

  it('starts again when the error comes back', () => {
    const improving = afterCorrect(afterError(), '2026-01-01');
    expect(improving.status).toBe('IMPROVING');
    expect(afterError()).toMatchObject({ status: 'ACTIVE', correctDays: 0 });
  });

  it('describes what was answered, for every format', () => {
    const mc = { options: [{ id: 'a', text: 'fit' }, { id: 'b', text: 'suit' }] };
    expect(describeResponse('multiple_choice', mc, { optionId: 'b' })).toBe('suit');
    expect(describeResponse('fill_blank', {}, { answer: 'negotiate' })).toBe('negotiate');
    expect(describeResponse('irregular_verb_forms', {}, { past: 'weared', pastParticiple: 'weared' })).toBe('weared / weared');
    expect(describeResponse('sentence_order', { tokens: ['b', 'a'] }, { order: [1, 0] })).toBe('a b');
    expect(describeResponse('flashcard', {}, { rating: 1 })).toBe('Marked as not known');
    const matching = { left: [{ id: 'l1', text: 'weird' }], right: [{ id: 'r1', text: 'عجیب' }] };
    expect(describeResponse('matching', matching, { pairs: { l1: 'r1' } })).toBe('weird → عجیب');
  });
});

describe('xp and levels', () => {
  it('pays more for harder exercises, a little for a typo, and 1 for trying', () => {
    expect(xpForAttempt({ verdict: 'correct', level: 'RECOGNITION' })).toBe(5);
    expect(xpForAttempt({ verdict: 'correct', level: 'PRODUCTION' })).toBe(15);
    expect(xpForAttempt({ verdict: 'almost', level: 'RECALL' })).toBe(5);
    expect(xpForAttempt({ verdict: 'wrong', level: 'PRODUCTION' })).toBe(1);
  });

  it('pays a session bonus only when something was answered, more for a perfect one', () => {
    expect(xpForSession({ answered: 0, wrong: 0 })).toBe(0);
    expect(xpForSession({ answered: 8, wrong: 2 })).toBe(30);
    expect(xpForSession({ answered: 8, wrong: 0 })).toBe(50);
  });

  it('derives the level from total XP', () => {
    expect(levelForXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100 });
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpForLevel: 200 });
    expect(levelForXp(300).level).toBe(3);
    expect(levelForXp(1420)).toMatchObject({ level: 5 });
  });
});

describe('streak', () => {
  const fresh = { currentStreak: 0, longestStreak: 0, lastStreakDate: null };

  it('starts at 1 on the first goal day and grows on consecutive days', () => {
    let s = advanceStreak(fresh, '2026-03-01', true);
    expect(s).toEqual({ currentStreak: 1, longestStreak: 1, lastStreakDate: '2026-03-01' });
    s = advanceStreak(s, '2026-03-02', true);
    expect(s.currentStreak).toBe(2);
  });

  it('counts a day once, and ignores days without a met goal', () => {
    const s = advanceStreak(fresh, '2026-03-01', true);
    expect(advanceStreak(s, '2026-03-01', true)).toBe(s);
    expect(advanceStreak(s, '2026-03-02', false)).toBe(s);
  });

  it('starts again after a missed day but remembers the longest', () => {
    let s = advanceStreak(advanceStreak(fresh, '2026-03-01', true), '2026-03-02', true);
    s = advanceStreak(s, '2026-03-05', true);
    expect(s).toMatchObject({ currentStreak: 1, longestStreak: 2 });
  });

  it('works across month and year boundaries', () => {
    const s = advanceStreak({ currentStreak: 4, longestStreak: 4, lastStreakDate: '2026-12-31' }, '2027-01-01', true);
    expect(s.currentStreak).toBe(5);
  });

  it('shows the streak as alive today or yesterday, and over after that', () => {
    const s = { currentStreak: 6, longestStreak: 9, lastStreakDate: '2026-03-10' };
    expect(visibleStreak(s, '2026-03-10')).toBe(6);
    expect(visibleStreak(s, '2026-03-11')).toBe(6); // today's goal not met yet, still alive
    expect(visibleStreak(s, '2026-03-12')).toBe(0);
    expect(visibleStreak(fresh, '2026-03-12')).toBe(0);
  });
});
