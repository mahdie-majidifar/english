import { z } from 'zod';
import type { ErrorTypeCode, ClientExercise, Verdict } from './exercises.js';
import type { CurrentContext } from './catalog.js';
import type { ItemType, LearningStatus } from './enums.js';

// ───────────── Daily session ─────────────

export const SESSION_BLOCKS = ['WARM_UP', 'NEW_CONTENT', 'PRACTICE', 'CONTEXT', 'PRODUCTION', 'REVIEW'] as const;
export type SessionBlock = (typeof SESSION_BLOCKS)[number];

export const SELECTION_REASONS = ['DUE_REVIEW', 'MISTAKE', 'WEAK_AREA', 'NEW_CONTENT', 'TEACHER_ASSIGNED', 'RECOVERY'] as const;
export type SelectionReason = (typeof SELECTION_REASONS)[number];

export type SessionStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

/** Plain-language reason shown to the learner, so the plan never feels arbitrary. */
export const REASON_LABELS: Record<SelectionReason, string> = {
  DUE_REVIEW: 'Time to review',
  MISTAKE: 'You missed this before',
  WEAK_AREA: 'Needs more practice',
  NEW_CONTENT: 'New in your lesson',
  TEACHER_ASSIGNED: 'From your teacher',
  RECOVERY: 'Try again',
};

export const BLOCK_LABELS: Record<SessionBlock, string> = {
  WARM_UP: 'Warm-up',
  NEW_CONTENT: 'New words',
  PRACTICE: 'Practice',
  CONTEXT: 'In context',
  PRODUCTION: 'Your own sentences',
  REVIEW: 'Quick review',
};

export const CompleteSessionSchema = z.object({}).strict();

export interface SessionExerciseDto extends ClientExercise {
  sessionItemId: string;
  position: number;
  block: SessionBlock;
  reason: SelectionReason;
  /** Present when this slot was already answered (resuming a session). */
  answered: { verdict: Verdict; isCorrect: boolean } | null;
}

export interface SessionResultDto {
  answered: number;
  correct: number;
  almost: number;
  wrong: number;
  /** 0..1, from the answers' scores. */
  accuracy: number;
  /** Everything earned in this session: answers plus the completion bonus. */
  xpEarned: number;
  activeSeconds: number;
  streak: { current: number; longest: number; goalMetToday: boolean };
}

export interface DailySessionDto {
  id: string;
  status: SessionStatus;
  localDate: string;
  ordinal: number;
  plannedSeconds: number;
  total: number;
  answeredCount: number;
  /** How many items came from each reason. */
  summary: Partial<Record<SelectionReason, number>>;
  exercises: SessionExerciseDto[];
  result: SessionResultDto | null;
}

export interface DailySessionEnvelope {
  session: DailySessionDto | null;
  /** Why there is no session. */
  reason?: 'NOTHING_TO_PRACTICE';
}

export interface SessionSummaryDto {
  id: string;
  status: SessionStatus;
  ordinal: number;
  total: number;
  answeredCount: number;
  plannedMinutes: number;
  summary: Partial<Record<SelectionReason, number>>;
}

export const CreateSessionSchema = z.object({ extra: z.boolean().default(false) }).strict();
export type CreateSession = z.infer<typeof CreateSessionSchema>;

// ───────────── Mistakes ─────────────

export const MistakeListQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type MistakeListQuery = z.infer<typeof MistakeListQuerySchema>;

export interface MistakeDto {
  id: string;
  item: { id: string; headword: string; type: ItemType };
  errorCode: ErrorTypeCode;
  errorLabelEn: string;
  errorLabelFa: string;
  status: 'ACTIVE' | 'IMPROVING' | 'RESOLVED';
  occurrences: number;
  /** Three or more times in the last two weeks. */
  repeated: boolean;
  /** Days of right answers still needed to resolve it (0 once resolved). */
  correctDaysNeeded: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  lastSeenAt: string;
  recent: { userAnswer: string; expectedAnswer: string; createdAt: string }[];
}

export interface MistakeSummary {
  active: number;
  improving: number;
  resolved: number;
  repeated: number;
}

// ───────────── Dashboard ─────────────

export interface WeakArea {
  kind: 'error' | 'item';
  label: string;
  labelFa?: string;
  count: number;
  /** Items to show as examples. */
  items: { id: string; headword: string }[];
}

export interface DashboardDto {
  today: {
    session: SessionSummaryDto | null;
    goalMinutes: number;
    activeMinutes: number;
    goalMet: boolean;
  };
  current: CurrentContext | null;
  streak: { current: number; longest: number };
  xp: { total: number; level: number; intoLevel: number; forLevel: number };
  weakAreas: WeakArea[];
  reviews: { dueCount: number; upcoming: { itemId: string; headword: string; due: string }[] };
  mistakes: MistakeSummary;
  totals: { items: number } & Record<Lowercase<LearningStatus>, number>;
}
