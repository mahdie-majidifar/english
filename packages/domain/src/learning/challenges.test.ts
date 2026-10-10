import { describe, expect, it } from 'vitest';
import {
  DAILY_CHALLENGES,
  WEEKLY_CHALLENGES,
  challengeProgress,
  challengeRewardKey,
  dailyChallenge,
  weekStart,
  weeklyChallenge,
  type ChallengeMetrics,
} from './challenges.js';

const metrics = (m: Partial<ChallengeMetrics> = {}): ChallengeMetrics => ({ attempts: 0, correct: 0, minutes: 0, xp: 0, sessions: 0, activeDays: 0, ...m });

describe('weekStart', () => {
  it('is the Monday of the week', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05'); // a Monday
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // a Sunday belongs to the week before it
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });

  it('crosses months and years', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
});

describe('picking a challenge', () => {
  it('is the same for the same learner on the same day', () => {
    expect(dailyChallenge('u1', '2026-10-10')).toBe(dailyChallenge('u1', '2026-10-10'));
    expect(weeklyChallenge('u1', '2026-10-10')).toBe(weeklyChallenge('u1', '2026-10-10'));
  });

  it('the weekly one stays the same all week and changes with the week', () => {
    const week = ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-11'].map((d) => weeklyChallenge('u1', d).code);
    expect(new Set(week).size).toBe(1);
    const later = new Set(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map((d) => weeklyChallenge('u1', d).code));
    expect(later.size).toBeGreaterThan(1);
  });

  it('varies from day to day, and from learner to learner', () => {
    const days = new Set(Array.from({ length: 30 }, (_, i) => dailyChallenge('u1', `2026-10-${String(i + 1).padStart(2, '0')}`).code));
    expect(days.size).toBeGreaterThan(1);
    const learners = new Set(Array.from({ length: 30 }, (_, i) => dailyChallenge(`user-${i}`, '2026-10-10').code));
    expect(learners.size).toBeGreaterThan(1);
  });

  it('always picks from the right list', () => {
    for (let i = 0; i < 50; i++) {
      expect(DAILY_CHALLENGES).toContain(dailyChallenge(`u${i}`, '2026-10-10'));
      expect(WEEKLY_CHALLENGES).toContain(weeklyChallenge(`u${i}`, '2026-10-10'));
    }
  });
});

describe('the challenge lists', () => {
  it('have unique codes, real targets and a reward', () => {
    const all = [...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES];
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length);
    for (const c of all) {
      expect(c.target).toBeGreaterThan(0);
      expect(c.rewardXp).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(8);
    }
    expect(DAILY_CHALLENGES.every((c) => c.kind === 'DAILY')).toBe(true);
    expect(WEEKLY_CHALLENGES.every((c) => c.kind === 'WEEKLY')).toBe(true);
    expect(Math.min(...WEEKLY_CHALLENGES.map((c) => c.rewardXp))).toBeGreaterThan(Math.max(...DAILY_CHALLENGES.map((c) => c.rewardXp)));
  });
});

describe('progress', () => {
  const answer15 = DAILY_CHALLENGES.find((c) => c.code === 'D_ANSWER_15')!;

  it('counts toward the target and caps at it', () => {
    expect(challengeProgress(answer15, metrics({ attempts: 6 }))).toEqual({ progress: 6, target: 15, done: false });
    expect(challengeProgress(answer15, metrics({ attempts: 15 }))).toEqual({ progress: 15, target: 15, done: true });
    expect(challengeProgress(answer15, metrics({ attempts: 40 }))).toEqual({ progress: 15, target: 15, done: true });
  });

  it('reads the metric the challenge is about', () => {
    const session = DAILY_CHALLENGES.find((c) => c.code === 'D_SESSION_1')!;
    expect(challengeProgress(session, metrics({ attempts: 99 })).done).toBe(false);
    expect(challengeProgress(session, metrics({ sessions: 1 })).done).toBe(true);
  });
});

describe('the reward key', () => {
  it('is per day for a daily challenge and per week for a weekly one', () => {
    const d = DAILY_CHALLENGES[0]!;
    const w = WEEKLY_CHALLENGES[0]!;
    expect(challengeRewardKey(d, '2026-10-10')).not.toBe(challengeRewardKey(d, '2026-10-11'));
    expect(challengeRewardKey(w, '2026-10-06')).toBe(challengeRewardKey(w, '2026-10-11'));
    expect(challengeRewardKey(w, '2026-10-11')).not.toBe(challengeRewardKey(w, '2026-10-12'));
  });
});
