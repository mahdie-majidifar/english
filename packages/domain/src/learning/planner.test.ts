import { describe, expect, it } from 'vitest';
import type { ExerciseFormat, ExerciseLevel } from '@coach/contracts';
import { seededRng } from '../exercises/templates.js';
import {
  planDailySession,
  scoreItem,
  teacherRecency,
  DEFAULT_WEIGHTS,
  type PlannerItem,
  type PoolExercise,
} from './planner.js';

const NOW = new Date('2026-03-10T09:00:00Z');
const DAY = 86_400_000;

let n = 0;
const ex = (level: ExerciseLevel, format: ExerciseFormat, seconds = 20, recentlyAnswered = false): PoolExercise => ({
  id: `ex${++n}`,
  level,
  format,
  estimatedSeconds: seconds,
  recentlyAnswered,
});

const fullPool = (): PoolExercise[] => [
  ex('RECOGNITION', 'flashcard', 12),
  ex('RECOGNITION', 'multiple_choice', 15),
  ex('RECALL', 'fill_blank', 25),
  ex('CONTEXT', 'sentence_order', 30),
];

const item = (id: string, patch: Partial<PlannerItem> = {}): PlannerItem => ({
  id,
  state: null,
  mistakePriority: 0,
  inCurrentLesson: false,
  teacherRecency: 0,
  seenToday: false,
  pool: fullPool(),
  ...patch,
});

const known = (patch: Partial<NonNullable<PlannerItem['state']>> = {}): NonNullable<PlannerItem['state']> => ({
  status: 'REVIEW',
  due: new Date(NOW.getTime() + 5 * DAY),
  retrievability: 0.9,
  mastery: 0.6,
  isWeak: false,
  currentLevel: 'RECALL',
  ...patch,
});

const due = (patch: Partial<NonNullable<PlannerItem['state']>> = {}) =>
  known({ due: new Date(NOW.getTime() - DAY), retrievability: 0.6, ...patch });

const plan = (items: PlannerItem[], config: Partial<Parameters<typeof planDailySession>[1]> = {}) =>
  planDailySession(items, { budgetSeconds: 600, maxNewItems: 5, now: NOW, ...config }, seededRng('plan'));

describe('free review', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  const known = (id: string, mastery: number, extra: Partial<PlannerItem> = {}): PlannerItem => ({
    id,
    state: { status: 'REVIEW', due: new Date('2026-11-01T00:00:00Z'), retrievability: 0.95, mastery, isWeak: false, currentLevel: 'RECALL' },
    mistakePriority: 0,
    inCurrentLesson: false,
    teacherRecency: 0,
    seenToday: false,
    pool: [{ id: `e-${id}`, format: 'multiple_choice', level: 'RECALL', estimatedSeconds: 15, recentlyAnswered: false }],
    ...extra,
  });

  it('does nothing on its own: items that are not due stay out', () => {
    expect(scoreItem(known('a', 0.2), now, DEFAULT_WEIGHTS).score).toBe(0);
  });

  it('when switched on, the less an item is known the higher it ranks', () => {
    const weights = { ...DEFAULT_WEIGHTS, freeReview: 1 };
    const low = scoreItem(known('a', 0.2), now, weights).score;
    const high = scoreItem(known('b', 0.9), now, weights).score;
    expect(low).toBeGreaterThan(high);
    expect(low).toBeCloseTo(0.8);
  });

  it('a session can then be built from items that are not due', () => {
    const items = [known('a', 0.2), known('b', 0.5), known('c', 0.95)];
    expect(planDailySession(items, { budgetSeconds: 600, maxNewItems: 5, now }, () => 0.5).steps).toEqual([]);
    const plan = planDailySession(items, { budgetSeconds: 600, maxNewItems: 5, now, weights: { freeReview: 1 } }, () => 0.5);
    expect(plan.steps.map((s) => s.itemId)).toEqual(['a', 'b']); // the well-known one is left out
  });

  it('never applies to new items, which have their own weight', () => {
    const fresh: PlannerItem = { ...known('n', 0), state: null };
    expect(scoreItem(fresh, now, { ...DEFAULT_WEIGHTS, freeReview: 1 }).score).toBe(DEFAULT_WEIGHTS.newItem);
  });
});

describe('scoreItem', () => {
  const w = DEFAULT_WEIGHTS;

  it('ranks a due review above a new word, and a serious mistake above a fresh teacher word', () => {
    const dueScore = scoreItem(item('a', { state: due() }), NOW, w);
    const newScore = scoreItem(item('b', { inCurrentLesson: true }), NOW, w);
    expect(dueScore.score).toBeGreaterThan(newScore.score);
    expect(dueScore.reason).toBe('DUE_REVIEW');

    const mistake = scoreItem(item('c', { state: known(), mistakePriority: 6 }), NOW, w);
    const teacher = scoreItem(item('d', { teacherRecency: 1 }), NOW, w);
    expect(mistake.score).toBeGreaterThan(teacher.score);
    expect(mistake.reason).toBe('MISTAKE');
  });

  it('labels new items by where they came from', () => {
    expect(scoreItem(item('a', { teacherRecency: 0.8 }), NOW, w).reason).toBe('TEACHER_ASSIGNED');
    expect(scoreItem(item('b', { inCurrentLesson: true }), NOW, w).reason).toBe('NEW_CONTENT');
    expect(scoreItem(item('c', { state: known({ isWeak: true }) }), NOW, w).reason).toBe('WEAK_AREA');
  });

  it('does not count an item as due before its date, or when it is brand new', () => {
    expect(scoreItem(item('a', { state: known() }), NOW, w).score).toBeLessThan(0.3);
    expect(scoreItem(item('b', { state: { ...due(), status: 'NEW' } }), NOW, w).reason).not.toBe('DUE_REVIEW');
  });

  it('pushes down what was already practised today', () => {
    const a = scoreItem(item('a', { state: due() }), NOW, w).score;
    const b = scoreItem(item('a', { state: due(), seenToday: true }), NOW, w).score;
    expect(b).toBeLessThan(a);
  });
});

describe('planDailySession', () => {
  it('returns an empty plan when there is nothing worth practising', () => {
    expect(plan([]).steps).toEqual([]);
    expect(plan([item('a', { state: known() })]).steps).toEqual([]);
  });

  it('stays within the time budget, leaving room to read feedback', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`i${i}`, { state: due(), pool: fullPool() }));
    const p = plan(items, { budgetSeconds: 300 });
    expect(p.plannedSeconds).toBeLessThanOrEqual(300 * 0.85);
    expect(p.plannedSeconds).toBeGreaterThan(300 * 0.5);
    expect(p.steps.length).toBeGreaterThan(5);
  });

  it('uses each item at most once', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`i${i}`, { state: due() }));
    const ids = plan(items).steps.map((s) => s.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('limits how many new words arrive in one session', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`n${i}`, { inCurrentLesson: true }));
    const p = plan(items, { maxNewItems: 3 });
    expect(p.steps.filter((s) => s.reason === 'NEW_CONTENT').length).toBeLessThanOrEqual(3);
  });

  it('does not let new words use more than a third of the time', () => {
    const items = [
      ...Array.from({ length: 12 }, (_, i) => item(`n${i}`, { inCurrentLesson: true, teacherRecency: 1 })),
      ...Array.from({ length: 12 }, (_, i) => item(`d${i}`, { state: due() })),
    ];
    const p = plan(items, { maxNewItems: 12 });
    const newTime = p.steps.filter((s) => s.reason === 'TEACHER_ASSIGNED').reduce((a, s) => a + s.estimatedSeconds, 0);
    expect(newTime).toBeLessThanOrEqual(600 * 0.85 * 0.3 + 30);
    expect(p.steps.some((s) => s.reason === 'DUE_REVIEW')).toBe(true);
  });

  it('puts reviews, mistakes and new words together when all are present', () => {
    const p = plan([
      item('review', { state: due() }),
      item('mistake', { state: known({ due: new Date(NOW.getTime() + 3 * DAY) }), mistakePriority: 5 }),
      item('fresh', { inCurrentLesson: true }),
    ]);
    expect(Object.keys(p.summary).sort()).toEqual(['DUE_REVIEW', 'MISTAKE', 'NEW_CONTENT']);
    expect(p.steps.map((s) => s.itemId).sort()).toEqual(['fresh', 'mistake', 'review']);
  });

  it('matches exercise difficulty to the item, and starts new items gently', () => {
    const p = plan([
      item('advanced', { state: due({ currentLevel: 'CONTEXT' }) }),
      item('fresh', { inCurrentLesson: true }),
    ]);
    expect(p.steps.find((s) => s.itemId === 'advanced')!.level).toBe('CONTEXT');
    expect(['RECOGNITION', 'RECALL']).toContain(p.steps.find((s) => s.itemId === 'fresh')!.level);
  });

  it('orders blocks: warm-up, new content, practice, context', () => {
    const items = [
      item('new1', { inCurrentLesson: true }),
      item('ctx', { state: due({ currentLevel: 'CONTEXT', mastery: 0.7 }) }),
      item('easy', { state: due({ currentLevel: 'RECOGNITION', mastery: 0.6 }) }),
      item('rec', { state: due({ currentLevel: 'RECALL', mastery: 0.3 }) }),
    ];
    const order = plan(items).steps.map((s) => s.block);
    const rank = ['WARM_UP', 'NEW_CONTENT', 'PRACTICE', 'CONTEXT', 'PRODUCTION', 'REVIEW'];
    expect([...order].sort((a, b) => rank.indexOf(a) - rank.indexOf(b))).toEqual(order);
    expect(order[0]).toBe('WARM_UP'); // an easy item the learner already knows starts the session
    expect(order).toContain('NEW_CONTENT');
  });

  it('does not repeat one format three times in a row when there is a choice', () => {
    const onlyFlashcards = () => [ex('RECOGNITION', 'flashcard', 12)];
    const mix = () => [ex('RECOGNITION', 'multiple_choice', 15)];
    const items = [
      ...Array.from({ length: 4 }, (_, i) => item(`f${i}`, { state: due({ currentLevel: 'RECOGNITION' }), pool: onlyFlashcards() })),
      ...Array.from({ length: 4 }, (_, i) => item(`m${i}`, { state: due({ currentLevel: 'RECOGNITION' }), pool: mix() })),
    ];
    const formats = plan(items).steps.map((s) => s.format);
    for (let i = 2; i < formats.length; i++) {
      expect(!(formats[i] === formats[i - 1] && formats[i] === formats[i - 2]), `run of three at ${i}`).toBe(true);
    }
  });

  it('skips items that have no exercise available', () => {
    const p = plan([item('empty', { state: due(), pool: [] }), item('ok', { state: due() })]);
    expect(p.steps.map((s) => s.itemId)).toEqual(['ok']);
  });

  it('prefers exercises not answered recently', () => {
    const stale = ex('RECALL', 'fill_blank', 25, true);
    const fresh = ex('RECALL', 'word_formation', 25, false);
    const p = plan([item('a', { state: due({ currentLevel: 'RECALL' }), pool: [stale, fresh] })]);
    expect(p.steps[0]!.exerciseId).toBe(fresh.id);
  });

  it('is deterministic for the same state and seed', () => {
    const make = () => Array.from({ length: 12 }, (_, i) => item(`i${i}`, { state: due(), pool: fullPool().map((e) => ({ ...e, id: `${e.id}-${i}` })) }));
    const a = planDailySession(make(), { budgetSeconds: 600, maxNewItems: 5, now: NOW }, seededRng('x'));
    const b = planDailySession(make(), { budgetSeconds: 600, maxNewItems: 5, now: NOW }, seededRng('x'));
    const shape = (p: typeof a) => p.steps.map((s) => [s.itemId, s.format, s.level, s.block]);
    expect(shape(a)).toEqual(shape(b));
  });
});

describe('teacherRecency', () => {
  it('is 1 today and halves every week', () => {
    expect(teacherRecency(0)).toBe(1);
    expect(teacherRecency(7)).toBeCloseTo(0.5);
    expect(teacherRecency(14)).toBeCloseTo(0.25);
    expect(teacherRecency(-3)).toBe(1);
  });
});
