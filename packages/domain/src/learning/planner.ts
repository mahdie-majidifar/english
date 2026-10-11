import type { ExerciseFormat, ExerciseLevel, LearningStatus } from '@coach/contracts';
import { chooseExercise, oneLevelUp } from '../exercises/selection.js';

export type SelectionReason = 'DUE_REVIEW' | 'MISTAKE' | 'WEAK_AREA' | 'NEW_CONTENT' | 'TEACHER_ASSIGNED' | 'RECOVERY';
export type SessionBlock = 'WARM_UP' | 'NEW_CONTENT' | 'PRACTICE' | 'CONTEXT' | 'PRODUCTION' | 'REVIEW';

export const BLOCK_ORDER: SessionBlock[] = ['WARM_UP', 'NEW_CONTENT', 'PRACTICE', 'CONTEXT', 'PRODUCTION', 'REVIEW'];

export interface PoolExercise {
  id: string;
  format: ExerciseFormat;
  level: ExerciseLevel;
  estimatedSeconds: number;
  /** Answered in the last day: allowed, but only when nothing fresher fits. */
  recentlyAnswered: boolean;
}

export interface PlannerItem {
  id: string;
  /** Null when the learner has never practised the item. */
  state: {
    status: LearningStatus;
    due: Date | null;
    /** Chance (0..1) of recalling it right now. */
    retrievability: number;
    mastery: number;
    isWeak: boolean;
    currentLevel: ExerciseLevel;
  } | null;
  /** Highest priority among the item's open mistakes (0 when there are none). */
  mistakePriority: number;
  inCurrentLesson: boolean;
  /** 1 for something taught today, fading by half every week (0 when unrelated to a class). */
  teacherRecency: number;
  /** Already practised today. */
  seenToday: boolean;
  pool: PoolExercise[];
}

export interface PlannerWeights {
  overdue: number;
  mistake: number;
  weak: number;
  teacher: number;
  currentLesson: number;
  newItem: number;
  seenToday: number;
  /**
   * Brings back items that are not due: the less well known, the more it counts. Off (0) normally, so
   * the schedule decides; switched on only when a learner asks for a session and nothing is due.
   */
  freeReview: number;
}

export const DEFAULT_WEIGHTS: PlannerWeights = {
  overdue: 3.5,
  mistake: 3,
  weak: 2,
  teacher: 1.5,
  currentLesson: 1,
  newItem: 1.2,
  seenToday: -2.5,
  freeReview: 0,
};

export interface PlannerConfig {
  budgetSeconds: number;
  maxNewItems: number;
  /** The level a brand-new item starts at (from the difficulty setting). */
  startLevel?: ExerciseLevel;
  now: Date;
  weights?: Partial<PlannerWeights>;
}

export interface PlannedStep {
  itemId: string;
  exerciseId: string;
  block: SessionBlock;
  reason: SelectionReason;
  level: ExerciseLevel;
  format: ExerciseFormat;
  estimatedSeconds: number;
  score: number;
}

export interface SessionPlan {
  steps: PlannedStep[];
  plannedSeconds: number;
  /** Short counts for the intro screen: how many reviews, mistakes, new words. */
  summary: Partial<Record<SelectionReason, number>>;
}

/** Time left for answering: the rest is for reading feedback between questions. */
const USABLE_SHARE = 0.85;
const MAX_NEW_SHARE = 0.3;
const MAX_DUE_SHARE = 0.5;
/** Below this an item is not worth a place in the session. */
const MIN_SCORE = 0.3;

const isNewItem = (i: PlannerItem) => !i.state || i.state.status === 'NEW';
const isDue = (i: PlannerItem, now: Date) => Boolean(i.state?.due && i.state.due <= now && i.state.status !== 'NEW');

/** Why an item is a candidate, and how much it deserves a place today. */
export function scoreItem(item: PlannerItem, now: Date, weights: PlannerWeights): { score: number; reason: SelectionReason } {
  const due = isDue(item, now);
  // A review that is due always matters; the more it has faded, the more it matters.
  const overdue = due ? 0.6 + 0.4 * (1 - (item.state?.retrievability ?? 0)) : 0;
  const mistake = Math.min(1, item.mistakePriority / 6);
  const weak = item.state?.isWeak ? 1 - (item.state?.mastery ?? 0) : 0;

  const score =
    weights.overdue * overdue +
    weights.mistake * mistake +
    weights.weak * weak +
    weights.teacher * item.teacherRecency +
    weights.currentLesson * (item.inCurrentLesson ? 1 : 0) +
    weights.newItem * (isNewItem(item) ? 1 : 0) +
    (item.seenToday ? weights.seenToday : 0) +
    (item.state && !isNewItem(item) ? weights.freeReview * (1 - item.state.mastery) : 0);

  const reason: SelectionReason = due
    ? 'DUE_REVIEW'
    : item.mistakePriority > 0
      ? 'MISTAKE'
      : item.state?.isWeak
        ? 'WEAK_AREA'
        : isNewItem(item)
          ? item.teacherRecency > 0.3
            ? 'TEACHER_ASSIGNED'
            : 'NEW_CONTENT'
          : 'WEAK_AREA';
  return { score, reason };
}

function blockFor(step: Pick<PlannedStep, 'reason' | 'level'>): SessionBlock {
  if (step.reason === 'NEW_CONTENT' || step.reason === 'TEACHER_ASSIGNED') return 'NEW_CONTENT';
  if (step.level === 'CONTEXT') return 'CONTEXT';
  if (step.level === 'PRODUCTION') return 'PRODUCTION';
  return 'PRACTICE';
}

/**
 * Appends steps to `out`, ordered so the same format never appears three times in a row (when
 * there is a choice). It looks at what `out` already ends with, so blocks join up cleanly too.
 */
function interleaveInto(out: PlannedStep[], steps: PlannedStep[]): void {
  const rest = [...steps];
  while (rest.length > 0) {
    const last2 = out.slice(-2).map((s) => s.format);
    const blocked = last2.length === 2 && last2[0] === last2[1] ? last2[0] : null;
    const remaining = new Map<ExerciseFormat, number>();
    for (const s of rest) remaining.set(s.format, (remaining.get(s.format) ?? 0) + 1);

    // Prefer the format with the most steps left (so one format is not stranded at the end), then
    // the best-scored step. Scores are already in order, so the first match wins ties.
    let pick = -1;
    rest.forEach((s, i) => {
      if (s.format === blocked) return;
      if (pick === -1 || remaining.get(s.format)! > remaining.get(rest[pick]!.format)!) pick = i;
    });
    out.push(...rest.splice(pick === -1 ? 0 : pick, 1));
  }
}
/**
 * Chooses what today's session contains. A pure function: the same learner state always gives the
 * same plan, which makes the rules easy to read, test and tune. AI is not involved.
 *
 * 1. Score every item: due reviews, mistakes, weak items, fresh teacher content, the current lesson.
 * 2. Fill the time budget best-first, with limits so new words or reviews cannot crowd everything out.
 * 3. Order into blocks: warm-up, new content, practice, context, production.
 */
export function planDailySession(items: PlannerItem[], config: PlannerConfig, rng: () => number): SessionPlan {
  const weights = { ...DEFAULT_WEIGHTS, ...config.weights };
  const budget = config.budgetSeconds * USABLE_SHARE;

  const ranked = items
    .map((item) => ({ item, ...scoreItem(item, config.now, weights) }))
    .filter((c) => c.score >= MIN_SCORE && c.item.pool.length > 0)
    .sort((a, b) => b.score - a.score);

  const chosen: PlannedStep[] = [];
  const taken = new Set<string>();
  let seconds = 0;
  let newCount = 0;
  let newSeconds = 0;
  let dueSeconds = 0;

  const tryAdd = (candidate: (typeof ranked)[number], relaxed: boolean): void => {
    if (taken.has(candidate.item.id)) return;
    const { item } = candidate;
    const fresh = isNewItem(item);
    if (fresh && newCount >= config.maxNewItems) return;

    const level = item.state?.currentLevel ?? config.startLevel ?? 'RECOGNITION';
    const exercise = chooseExercise(
      item.pool,
      level,
      chosen.slice(-2).map((s) => s.format),
      rng,
      fresh ? oneLevelUp(level) : 'PRODUCTION',
      (e) => e.recentlyAnswered,
    );
    if (!exercise || seconds + exercise.estimatedSeconds > budget) return;

    if (!relaxed) {
      if (fresh && newSeconds + exercise.estimatedSeconds > budget * MAX_NEW_SHARE) return;
      if (candidate.reason === 'DUE_REVIEW' && dueSeconds + exercise.estimatedSeconds > budget * MAX_DUE_SHARE) return;
    }

    taken.add(item.id);
    seconds += exercise.estimatedSeconds;
    if (fresh) {
      newCount++;
      newSeconds += exercise.estimatedSeconds;
    }
    if (candidate.reason === 'DUE_REVIEW') dueSeconds += exercise.estimatedSeconds;
    chosen.push({
      itemId: item.id,
      exerciseId: exercise.id,
      block: blockFor({ reason: candidate.reason, level: exercise.level }),
      reason: candidate.reason,
      level: exercise.level,
      format: exercise.format,
      estimatedSeconds: exercise.estimatedSeconds,
      score: candidate.score,
    });
  };

  for (const candidate of ranked) tryAdd(candidate, false);
  // Room left over because of the limits: use it for the next best items.
  for (const candidate of ranked) tryAdd(candidate, true);

  // Start with a win: up to two of the easiest steps on items the learner already knows.
  const warmUp = chosen
    .filter((s) => s.level === 'RECOGNITION' && s.reason !== 'NEW_CONTENT' && s.reason !== 'TEACHER_ASSIGNED')
    .filter((s) => (items.find((i) => i.id === s.itemId)?.state?.mastery ?? 0) >= 0.4)
    .slice(0, 2);
  for (const step of warmUp) step.block = 'WARM_UP';

  const steps: PlannedStep[] = [];
  for (const block of BLOCK_ORDER) interleaveInto(steps, chosen.filter((s) => s.block === block));

  const summary: SessionPlan['summary'] = {};
  for (const s of steps) summary[s.reason] = (summary[s.reason] ?? 0) + 1;
  return { steps, plannedSeconds: seconds, summary };
}

/** 1 when taught today, halving each week. */
export function teacherRecency(daysSinceClass: number): number {
  return Math.pow(0.5, Math.max(0, daysSinceClass) / 7);
}
