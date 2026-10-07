import { describe, expect, it } from 'vitest';
import type { AttemptResult, ClientExercise } from '@coach/contracts';
import { initialState, playerReducer, summarize, type PlayerAction, type PlayerState } from './player-state';

const exercise = (id: string): ClientExercise => ({
  id,
  format: 'multiple_choice',
  level: 'RECOGNITION',
  skill: 'VOCABULARY',
  origin: 'TEMPLATE',
  content: {},
  items: [{ id: `item-${id}`, headword: id }],
  estimatedSeconds: 15,
});

const result = (verdict: AttemptResult['verdict'], score: number): AttemptResult => ({
  attemptId: 'a',
  verdict,
  isCorrect: verdict !== 'wrong',
  score,
  correctAnswerText: 'x',
  explanationFa: null,
  errorCodes: [],
  detail: {},
  xp: 0,
  itemUpdates: [],
});

const run = (state: PlayerState, ...actions: PlayerAction[]) => actions.reduce(playerReducer, state);
const next = (n: number): PlayerAction => ({ type: 'next', initialValue: null, attemptId: `att-${n}`, now: n });
const skip = (n: number): PlayerAction => ({ type: 'skip', initialValue: null, attemptId: `att-${n}`, now: n });

const start = (count = 3) =>
  initialState(Array.from({ length: count }, (_, i) => exercise(`e${i}`)), null, 'att-0', 0);

describe('playerReducer', () => {
  it('moves through answering, submitting and feedback', () => {
    let s = start();
    expect(s.phase).toBe('answering');
    s = run(s, { type: 'change', value: { optionId: 'a' } });
    expect(s.value).toEqual({ optionId: 'a' });
    s = run(s, { type: 'submit' });
    expect(s.phase).toBe('submitting');
    s = run(s, { type: 'submitted', result: result('correct', 1) });
    expect(s.phase).toBe('feedback');
    expect(s.result?.verdict).toBe('correct');
  });

  it('freezes the answer once it has been sent', () => {
    let s = run(start(), { type: 'change', value: 1 }, { type: 'submit' });
    s = run(s, { type: 'change', value: 2 });
    expect(s.value).toBe(1);
    s = run(s, { type: 'submitted', result: result('correct', 1) }, { type: 'change', value: 3 });
    expect(s.value).toBe(1);
  });

  it('returns to answering on a failed check, keeping the same attempt id so a retry is safe', () => {
    let s = run(start(), { type: 'change', value: 1 }, { type: 'submit' });
    s = run(s, { type: 'failed', message: 'The AI is busy.' });
    expect(s).toMatchObject({ phase: 'answering', error: 'The AI is busy.', attemptId: 'att-0', value: 1 });
    s = run(s, { type: 'change', value: 2 });
    expect(s.error).toBeNull(); // editing clears the error
  });

  it('only advances from feedback, and records the result', () => {
    let s = start();
    expect(run(s, next(1))).toBe(s); // nothing to advance from
    s = run(s, { type: 'submit' }, { type: 'submitted', result: result('wrong', 0) }, next(1));
    expect(s).toMatchObject({ index: 1, phase: 'answering', attemptId: 'att-1', result: null, shownAt: 1 });
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0]!.result?.verdict).toBe('wrong');
  });

  it('skipping records no result and moves on', () => {
    const s = run(start(), skip(5));
    expect(s.index).toBe(1);
    expect(s.steps).toEqual([{ exerciseId: 'e0', result: null }]);
  });

  it('cannot skip once the answer has been sent', () => {
    const s = run(start(), { type: 'submit' });
    expect(run(s, skip(1))).toBe(s);
  });

  it('finishes after the last question, whether answered or skipped', () => {
    let s = start(2);
    s = run(s, { type: 'submit' }, { type: 'submitted', result: result('correct', 1) }, next(1));
    expect(s.phase).toBe('answering');
    s = run(s, skip(2));
    expect(s.phase).toBe('done');
    expect(s.steps).toHaveLength(2);

    let t = start(1);
    t = run(t, { type: 'submit' }, { type: 'submitted', result: result('correct', 1) }, next(1));
    expect(t.phase).toBe('done');
  });

  it('an empty run is already done', () => {
    expect(start(0).phase).toBe('done');
  });
});

describe('summarize', () => {
  it('counts each outcome and averages the scores of answered questions', () => {
    const summary = summarize([
      { exerciseId: '1', result: result('correct', 1) },
      { exerciseId: '2', result: result('almost', 0.8) },
      { exerciseId: '3', result: result('wrong', 0) },
      { exerciseId: '4', result: null },
    ]);
    expect(summary).toMatchObject({ total: 4, answered: 3, correct: 1, almost: 1, wrong: 1, skipped: 1 });
    expect(summary.accuracy).toBeCloseTo(0.6);
  });

  it('is zero when nothing was answered', () => {
    expect(summarize([{ exerciseId: '1', result: null }]).accuracy).toBe(0);
    expect(summarize([]).total).toBe(0);
  });
});
