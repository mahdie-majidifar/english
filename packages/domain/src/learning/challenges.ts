import { addDays } from '../time.js';

export type ChallengeKind = 'DAILY' | 'WEEKLY';

/** What a challenge counts. All of it is read from the learner's daily activity. */
export interface ChallengeMetrics {
  attempts: number;
  correct: number;
  minutes: number;
  xp: number;
  sessions: number;
  /** Days with at least one answer (meaningful for the week). */
  activeDays: number;
}

export interface ChallengeDef {
  code: string;
  kind: ChallengeKind;
  title: string;
  description: string;
  metric: keyof ChallengeMetrics;
  target: number;
  rewardXp: number;
}

export const DAILY_REWARD_XP = 15;
export const WEEKLY_REWARD_XP = 60;

const daily = (code: string, title: string, description: string, metric: keyof ChallengeMetrics, target: number): ChallengeDef => ({
  code,
  kind: 'DAILY',
  title,
  description,
  metric,
  target,
  rewardXp: DAILY_REWARD_XP,
});
const weekly = (code: string, title: string, description: string, metric: keyof ChallengeMetrics, target: number): ChallengeDef => ({
  code,
  kind: 'WEEKLY',
  title,
  description,
  metric,
  target,
  rewardXp: WEEKLY_REWARD_XP,
});

export const DAILY_CHALLENGES: readonly ChallengeDef[] = [
  daily('D_ANSWER_15', 'Warm-up', 'Answer 15 questions today.', 'attempts', 15),
  daily('D_CORRECT_10', 'Sharpshooter', 'Get 10 answers right today.', 'correct', 10),
  daily('D_MINUTES_8', 'Focus time', 'Practise for 8 minutes today.', 'minutes', 8),
  daily('D_SESSION_1', 'Daily habit', 'Finish a daily session today.', 'sessions', 1),
];

export const WEEKLY_CHALLENGES: readonly ChallengeDef[] = [
  weekly('W_DAYS_4', 'Show up', 'Practise on 4 different days this week.', 'activeDays', 4),
  weekly('W_SESSIONS_5', 'Five sessions', 'Finish 5 daily sessions this week.', 'sessions', 5),
  weekly('W_XP_300', 'XP hunter', 'Earn 300 XP this week.', 'xp', 300),
  weekly('W_CORRECT_80', 'Sure hand', 'Get 80 answers right this week.', 'correct', 80),
];

/** A small stable hash, so the same learner gets the same challenge all day but not the same every day. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The Monday of the week a local date falls in. */
export function weekStart(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return addDays(localDate, -((weekday + 6) % 7));
}

/** Today's challenge for a learner. Picked from the date, so it needs no storage and never changes under them. */
export function dailyChallenge(userId: string, localDate: string): ChallengeDef {
  return DAILY_CHALLENGES[hash(`${userId}|${localDate}`) % DAILY_CHALLENGES.length]!;
}

export function weeklyChallenge(userId: string, localDate: string): ChallengeDef {
  return WEEKLY_CHALLENGES[hash(`${userId}|${weekStart(localDate)}`) % WEEKLY_CHALLENGES.length]!;
}

export interface ChallengeProgress {
  progress: number;
  target: number;
  done: boolean;
}

export function challengeProgress(def: ChallengeDef, metrics: ChallengeMetrics): ChallengeProgress {
  const value = Math.max(0, metrics[def.metric]);
  return { progress: Math.min(value, def.target), target: def.target, done: value >= def.target };
}

/** The key under which a challenge's reward is recorded, so it can only be paid once. */
export const challengeRewardKey = (def: ChallengeDef, localDate: string): string =>
  def.kind === 'DAILY' ? `${def.code}:${localDate}` : `${def.code}:${weekStart(localDate)}`;
