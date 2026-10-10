import { z } from 'zod';
import type { ItemType } from './enums.js';

export const PROGRESS_RANGES = [7, 30, 90] as const;
export const ProgressQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => (PROGRESS_RANGES as readonly number[]).includes(v), { message: 'Choose 7, 30 or 90 days.' })
    .default(30),
});
export type ProgressQuery = z.infer<typeof ProgressQuerySchema>;

export interface DayStat {
  /** YYYY-MM-DD, the learner's own day. */
  date: string;
  minutes: number;
  xp: number;
  attempts: number;
  correct: number;
  sessions: number;
  goalMet: boolean;
}

export interface WeekStat {
  minutes: number;
  xp: number;
  sessions: number;
  attempts: number;
  /** 0..1, null when nothing was answered. */
  accuracy: number | null;
  /** Items answered for the first time in this week. */
  newItems: number;
  activeDays: number;
}

/** How much of a group of items the learner has met, and how well they know them. */
export interface ItemGroupProgress {
  items: number;
  /** Answered at least once. */
  seen: number;
  mastered: number;
  /** 0..1 over all the items, so unseen items pull it down. */
  avgMastery: number;
}

export interface TypeProgress extends ItemGroupProgress {
  type: ItemType;
  label: string;
}

export interface UnitProgress extends ItemGroupProgress {
  unitId: string;
  number: number;
  title: string | null;
}

export interface BookProgress extends ItemGroupProgress {
  bookId: string;
  title: string;
  units: UnitProgress[];
}

export interface ProgressDto {
  days: number;
  today: string;
  totals: {
    activeMinutes: number;
    activeDays: number;
    sessions: number;
    attempts: number;
    accuracy: number | null;
    xp: number;
    quizzes: number;
    avgQuizScore: number | null;
    exams: number;
    avgExamScore: number | null;
  };
  daily: DayStat[];
  streak: { current: number; longest: number };
  level: { level: number; total: number; intoLevel: number; forLevel: number };
  statuses: { new: number; learning: number; review: number; mastered: number; weak: number; total: number };
  types: TypeProgress[];
  books: BookProgress[];
  week: { thisWeek: WeekStat; lastWeek: WeekStat };
  recentAssessments: { id: string; kind: 'QUIZ' | 'EXAM'; title: string; score: number; gradedAt: string }[];
}

// ───────────── Achievements ─────────────

export const ACHIEVEMENT_ICONS = ['footprints', 'flame', 'star', 'book', 'trophy', 'target', 'zap', 'flag', 'award', 'graduation'] as const;
export type AchievementIcon = (typeof ACHIEVEMENT_ICONS)[number];

/** What a celebration shows: no numbers, just what was earned. */
export interface AchievementBadge {
  code: string;
  title: string;
  description: string;
  icon: AchievementIcon;
}

export interface AchievementDto extends AchievementBadge {
  progress: number;
  target: number;
  unlockedAt: string | null;
}

export interface AchievementsDto {
  unlocked: number;
  total: number;
  achievements: AchievementDto[];
  /** Earned by this very request. Shown once. */
  newlyUnlocked: AchievementBadge[];
}

// ───────────── Challenges ─────────────

export interface ChallengeDto {
  kind: 'DAILY' | 'WEEKLY';
  code: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardXp: number;
  done: boolean;
}

export interface ChallengesDto {
  daily: ChallengeDto;
  weekly: ChallengeDto;
  /** Rewards paid by this very request (a challenge was just completed). */
  justCompleted: ChallengeDto[];
}
