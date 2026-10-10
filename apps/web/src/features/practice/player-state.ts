import type { AttemptResult, ClientExercise } from '@coach/contracts';

/**
 * The practice player as a small state machine. It lives apart from React so the rules
 * (what happens on skip, on a failed check, at the last question) are easy to test.
 *
 *   answering -> submitting -> feedback -> (next) answering ... -> done
 */
export type Phase = 'answering' | 'submitting' | 'feedback' | 'done';

export interface StepRecord {
  exerciseId: string;
  /** null when the learner skipped. */
  result: AttemptResult | null;
}

export interface PlayerState {
  exercises: ClientExercise[];
  index: number;
  phase: Phase;
  /** The answer being built, in the shape of the current format's response. */
  value: unknown;
  /** Sent with the check request. Kept across retries so a retry can never count twice. */
  attemptId: string;
  result: AttemptResult | null;
  error: string | null;
  steps: StepRecord[];
  /** The answer given (or the untouched start) at each question already left, so going back can restore it. */
  values: unknown[];
  /** When the current question was shown (ms). */
  shownAt: number;
}

export type PlayerAction =
  | { type: 'change'; value: unknown }
  | { type: 'submit' }
  | { type: 'submitted'; result: AttemptResult }
  | { type: 'failed'; message: string }
  | { type: 'next'; initialValue: unknown; attemptId: string; now: number }
  | { type: 'skip'; initialValue: unknown; attemptId: string; now: number }
  /** Exams only: return to the previous question with the answer that was given there. */
  | { type: 'back'; value: unknown; attemptId: string; now: number };

export function initialState(
  exercises: ClientExercise[],
  initialValue: unknown,
  attemptId: string,
  now: number,
): PlayerState {
  return {
    exercises,
    index: 0,
    phase: exercises.length === 0 ? 'done' : 'answering',
    value: initialValue,
    attemptId,
    result: null,
    error: null,
    steps: [],
    values: [],
    shownAt: now,
  };
}

const isLast = (s: PlayerState) => s.index >= s.exercises.length - 1;

function advance(
  s: PlayerState,
  step: StepRecord,
  initialValue: unknown,
  attemptId: string,
  now: number,
): PlayerState {
  const steps = [...s.steps, step];
  const values = [...s.values.slice(0, s.index), s.value];
  if (isLast(s)) return { ...s, steps, values, phase: 'done', result: null, error: null };
  return {
    ...s,
    steps,
    values,
    index: s.index + 1,
    phase: 'answering',
    value: initialValue,
    attemptId,
    result: null,
    error: null,
    shownAt: now,
  };
}

export function playerReducer(s: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'change':
      // The answer is frozen once it has been sent.
      return s.phase === 'answering' ? { ...s, value: action.value, error: null } : s;
    case 'submit':
      return s.phase === 'answering' ? { ...s, phase: 'submitting', error: null } : s;
    case 'submitted':
      return s.phase === 'submitting' ? { ...s, phase: 'feedback', result: action.result, error: null } : s;
    case 'failed':
      // Back to answering with the same attempt id: the learner can retry or skip.
      return s.phase === 'submitting' ? { ...s, phase: 'answering', error: action.message } : s;
    case 'next': {
      if (s.phase !== 'feedback' || !s.result) return s;
      const step = { exerciseId: s.exercises[s.index]!.id, result: s.result };
      return advance(s, step, action.initialValue, action.attemptId, action.now);
    }
    case 'back': {
      if (s.phase !== 'answering' || s.index === 0) return s;
      return {
        ...s,
        steps: s.steps.slice(0, -1),
        values: s.values.slice(0, s.index - 1),
        index: s.index - 1,
        value: action.value,
        attemptId: action.attemptId,
        result: null,
        error: null,
        shownAt: action.now,
      };
    }
    case 'skip': {
      if (s.phase !== 'answering') return s;
      const step = { exerciseId: s.exercises[s.index]!.id, result: null };
      return advance(s, step, action.initialValue, action.attemptId, action.now);
    }
  }
}

export interface Summary {
  total: number;
  answered: number;
  correct: number;
  almost: number;
  wrong: number;
  skipped: number;
  /** 0..1 over answered questions, using each answer's score. */
  accuracy: number;
}

export function summarize(steps: StepRecord[]): Summary {
  const answered = steps.filter((s) => s.result !== null);
  const results = answered.map((s) => s.result!);
  const correct = results.filter((r) => r.verdict === 'correct').length;
  const almost = results.filter((r) => r.verdict === 'almost').length;
  const wrong = results.filter((r) => r.verdict === 'wrong').length;
  const score = results.reduce((sum, r) => sum + r.score, 0);
  return {
    total: steps.length,
    answered: answered.length,
    correct,
    almost,
    wrong,
    skipped: steps.length - answered.length,
    accuracy: answered.length === 0 ? 0 : score / answered.length,
  };
}

export const isFinished = (s: PlayerState) => s.phase === 'done';
export const currentExercise = (s: PlayerState): ClientExercise | undefined => s.exercises[s.index];
