import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements, findAchievement, type AchievementStats } from './achievements.js';

const none: AchievementStats = {
  sessions: 0,
  longestStreak: 0,
  level: 1,
  itemsSeen: 0,
  itemsMastered: 0,
  mistakesResolved: 0,
  quizzes: 0,
  exams: 0,
  bestQuiz: null,
  bestExam: null,
  perfectTests: 0,
  bossesWon: 0,
  challengesDone: 0,
};
const done = (stats: Partial<AchievementStats>) => evaluateAchievements({ ...none, ...stats }).filter((a) => a.done).map((a) => a.code);

describe('achievements', () => {
  it('a new learner has earned nothing', () => {
    expect(done({})).toEqual([]);
  });

  it('every achievement has a unique code, a title and a target above zero', () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(2);
      expect(a.description.length).toBeGreaterThan(5);
      expect(a.target).toBeGreaterThan(0);
    }
  });

  it('sessions unlock in steps', () => {
    expect(done({ sessions: 1 })).toEqual(['FIRST_SESSION']);
    expect(done({ sessions: 10 })).toEqual(['FIRST_SESSION', 'SESSIONS_10']);
    expect(done({ sessions: 50 })).toEqual(['FIRST_SESSION', 'SESSIONS_10', 'SESSIONS_50']);
  });

  it('streaks use the longest streak ever, not today’s', () => {
    expect(done({ longestStreak: 2 })).toEqual([]);
    expect(done({ longestStreak: 7 })).toEqual(['STREAK_3', 'STREAK_7']);
  });

  it('quiz and exam scores count from their thresholds', () => {
    expect(done({ quizzes: 1, bestQuiz: 0.79 })).toEqual(['FIRST_QUIZ']);
    expect(done({ quizzes: 1, bestQuiz: 0.8 })).toEqual(['FIRST_QUIZ', 'QUIZ_80']);
    expect(done({ exams: 1, bestExam: 0.84 })).toEqual(['FIRST_EXAM']);
    expect(done({ exams: 1, bestExam: 0.85 })).toEqual(['FIRST_EXAM', 'EXAM_85']);
  });

  it('reports progress toward the next step, capped at the target', () => {
    const items = evaluateAchievements({ ...none, itemsSeen: 40 });
    expect(items.find((a) => a.code === 'ITEMS_25')).toMatchObject({ progress: 25, target: 25, done: true });
    expect(items.find((a) => a.code === 'ITEMS_100')).toMatchObject({ progress: 40, target: 100, done: false });
  });

  it('challenges add up', () => {
    expect(done({ challengesDone: 4 })).toEqual([]);
    expect(done({ challengesDone: 5 })).toEqual(['CHALLENGER']);
  });

  it('boss quizzes unlock in steps', () => {
    expect(done({ bossesWon: 1 })).toEqual(['BOSS_SLAYER']);
    expect(done({ bossesWon: 3 })).toEqual(['BOSS_SLAYER', 'BOSS_3']);
  });

  it('a perfect test is its own achievement', () => {
    expect(done({ perfectTests: 1 })).toEqual(['PERFECT']);
  });

  it('looks achievements up by code', () => {
    expect(findAchievement('FIXER')?.title).toBe('Fixer');
    expect(findAchievement('NOPE')).toBeUndefined();
  });
});
