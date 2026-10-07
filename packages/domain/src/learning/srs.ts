import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade, type State } from 'ts-fsrs';
import type { ExerciseLevel, Verdict } from '@coach/contracts';

/**
 * Spaced repetition with FSRS (the open scheduling model used by modern Anki).
 *
 * `enable_short_term` is off on purpose: this is a once-a-day practice app, so a new word should
 * come back in a day or more, not "in 10 minutes". `enable_fuzz` is off so scheduling is repeatable.
 */
const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false }),
);

/** 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;

/** Everything FSRS needs to remember about one item for one learner. */
export interface SrsState {
  due: Date | null;
  stability: number;
  difficulty: number;
  /** FSRS card state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  fsrsState: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  lastReviewedAt: Date | null;
  learningSteps: number;
}

export const emptySrs = (): SrsState => ({
  due: null,
  stability: 0,
  difficulty: 0,
  fsrsState: 0,
  reps: 0,
  lapses: 0,
  scheduledDays: 0,
  lastReviewedAt: null,
  learningSteps: 0,
});

function toCard(state: SrsState, now: Date): Card {
  if (state.reps === 0) return createEmptyCard(now);
  return {
    due: state.due ?? now,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0, // deprecated; FSRS derives it from last_review
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.fsrsState as State,
    last_review: state.lastReviewedAt ?? undefined,
  };
}

/** Schedules the next review after an answer. Returns the new state; the input is not modified. */
export function reviewCard(state: SrsState | null, rating: Rating, now: Date): SrsState {
  const { card } = scheduler.next(toCard(state ?? emptySrs(), now), now, rating as Grade);
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    fsrsState: card.state as number,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduled_days,
    lastReviewedAt: card.last_review ?? now,
    learningSteps: card.learning_steps,
  };
}

/** Chance (0..1) that the learner can still recall the item now. New items have none. */
export function retrievability(state: SrsState | null, now: Date): number {
  if (!state || state.reps === 0 || !state.lastReviewedAt) return 0;
  return scheduler.get_retrievability(toCard(state, now), now, false);
}

export interface RatingInput {
  verdict: Verdict;
  hintsUsed: number;
  level: ExerciseLevel;
  durationMs?: number | null;
  estimatedSeconds: number;
  /** Flashcards: the learner's own rating, used as is. */
  selfRating?: number;
}

/**
 * Turns an answer into an FSRS rating.
 * Wrong = Again. A typo or a hint = Hard. Right = Good. Right and quick on a context or production
 * exercise = Easy (answering quickly at a harder level shows the item is really known).
 */
export function ratingFor(input: RatingInput): Rating {
  if (input.selfRating && input.selfRating >= 1 && input.selfRating <= 4) return input.selfRating as Rating;
  if (input.verdict === 'wrong') return 1;
  if (input.verdict === 'almost' || input.hintsUsed > 0) return 2;
  const quick =
    input.durationMs != null && input.durationMs > 0 && input.durationMs < input.estimatedSeconds * 1000 * 0.6;
  const hard = input.level === 'CONTEXT' || input.level === 'PRODUCTION';
  return quick && hard ? 4 : 3;
}
