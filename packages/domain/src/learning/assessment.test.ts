import { describe, expect, it } from 'vitest';
import type { ExerciseFormat, ExerciseLevel } from '@coach/contracts';
import {
  gradeAssessment,
  pickQuestions,
  shouldRecommendExam,
  shouldRecommendQuiz,
  weakestSkill,
  xpForAssessment,
  type AssessmentExercise,
  type AssessmentItem,
} from './assessment.js';

// A small deterministic random source so the picks are repeatable.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

let n = 0;
const exercise = (
  format: ExerciseFormat,
  level: ExerciseLevel = 'RECOGNITION',
  extra: Partial<AssessmentExercise> = {},
): AssessmentExercise => ({ id: `e${++n}`, format, level, skill: 'VOCABULARY', answeredBefore: false, ...extra });

const item = (id: string, pool: AssessmentExercise[], extra: Partial<AssessmentItem> = {}): AssessmentItem => ({
  id,
  needsWork: false,
  level: 'RECOGNITION',
  pool,
  ...extra,
});

describe('pickQuestions', () => {
  it('takes at most one question per item before it repeats an item', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      item(`i${i}`, [exercise('multiple_choice'), exercise('fill_blank', 'RECALL')]),
    );
    const picked = pickQuestions({ kind: 'QUIZ', items, count: 6, rng: seeded(1) });
    expect(picked).toHaveLength(6);
    const owner = new Map(items.flatMap((i) => i.pool.map((e) => [e.id, i.id] as const)));
    expect(new Set(picked.map((p) => owner.get(p.id))).size).toBe(6);
  });

  it('never repeats a question and never asks for more than exist', () => {
    const items = [item('a', [exercise('multiple_choice'), exercise('fill_blank')]), item('b', [exercise('flashcard')])];
    const picked = pickQuestions({ kind: 'EXAM', items, count: 10, rng: seeded(2) });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((p) => p.id)).size).toBe(3);
  });

  it('leaves out questions that need the AI to be marked', () => {
    const items = [item('a', [exercise('free_production', 'PRODUCTION')]), item('b', [exercise('multiple_choice')])];
    const picked = pickQuestions({ kind: 'QUIZ', items, count: 5, rng: seeded(3) });
    expect(picked.map((p) => p.format)).toEqual(['multiple_choice']);
  });

  it('a quiz leans on items that need work', () => {
    const weak = Array.from({ length: 6 }, (_, i) => item(`w${i}`, [exercise('multiple_choice')], { needsWork: true }));
    const fine = Array.from({ length: 12 }, (_, i) => item(`f${i}`, [exercise('multiple_choice')]));
    const weakIds = new Set(weak.flatMap((w) => w.pool.map((e) => e.id)));
    const picked = pickQuestions({ kind: 'QUIZ', items: [...fine, ...weak], count: 10, rng: seeded(4) });
    expect(picked).toHaveLength(10);
    expect(picked.filter((p) => weakIds.has(p.id)).length).toBe(6); // ceil(10 * 0.6)
  });

  it('a quiz falls back to the rest when too few items need work', () => {
    const weak = [item('w', [exercise('multiple_choice')], { needsWork: true })];
    const fine = Array.from({ length: 9 }, (_, i) => item(`f${i}`, [exercise('multiple_choice')]));
    const picked = pickQuestions({ kind: 'QUIZ', items: [...weak, ...fine], count: 10, rng: seeded(5) });
    expect(picked).toHaveLength(10);
  });

  it('an exam prefers questions the learner has never answered', () => {
    const seen = exercise('multiple_choice', 'RECOGNITION', { answeredBefore: true });
    const unseen = exercise('fill_blank', 'RECOGNITION', { answeredBefore: false });
    for (let s = 0; s < 10; s++) {
      const picked = pickQuestions({ kind: 'EXAM', items: [item('a', [seen, unseen])], count: 1, rng: seeded(s) });
      expect(picked[0]!.id).toBe(unseen.id);
    }
  });

  it('a quiz avoids questions answered in the last day when it can', () => {
    const recent = exercise('multiple_choice');
    const fresh = exercise('fill_blank');
    const picked = pickQuestions({
      kind: 'QUIZ',
      items: [item('a', [recent, fresh])],
      count: 1,
      rng: seeded(7),
      recentlyAnswered: new Set([recent.id]),
    });
    expect(picked[0]!.id).toBe(fresh.id);
  });

  it('matches the level the learner has reached with the item', () => {
    const easy = exercise('multiple_choice', 'RECOGNITION');
    const hard = exercise('fill_blank', 'CONTEXT');
    const picked = pickQuestions({ kind: 'EXAM', items: [item('a', [easy, hard], { level: 'CONTEXT' })], count: 1, rng: seeded(8) });
    expect(picked[0]!.id).toBe(hard.id);
  });

  it('returns nothing when there is nothing to ask', () => {
    expect(pickQuestions({ kind: 'QUIZ', items: [], count: 5 })).toEqual([]);
    expect(pickQuestions({ kind: 'QUIZ', items: [item('a', [exercise('multiple_choice')])], count: 0 })).toEqual([]);
  });
});

describe('gradeAssessment', () => {
  const q = (skill: 'VOCABULARY' | 'GRAMMAR', score: number | null, verdict: 'correct' | 'almost' | 'wrong' | null) => ({
    skill,
    points: 1,
    score,
    verdict,
  });

  it('counts unanswered questions as zero', () => {
    const grade = gradeAssessment([q('VOCABULARY', 1, 'correct'), q('VOCABULARY', null, null), q('GRAMMAR', 0, 'wrong'), q('GRAMMAR', 0.8, 'almost')]);
    expect(grade).toMatchObject({ total: 4, correct: 1, almost: 1, wrong: 1, unanswered: 1 });
    expect(grade.score).toBeCloseTo(0.45);
  });

  it('breaks the score down by skill, weakest first', () => {
    const grade = gradeAssessment([q('VOCABULARY', 1, 'correct'), q('VOCABULARY', 1, 'correct'), q('GRAMMAR', 1, 'correct'), q('GRAMMAR', 0, 'wrong')]);
    expect(grade.breakdown).toEqual([
      { skill: 'GRAMMAR', score: 0.5, correct: 1, total: 2 },
      { skill: 'VOCABULARY', score: 1, correct: 2, total: 2 },
    ]);
  });

  it('weights questions by their points', () => {
    const grade = gradeAssessment([
      { skill: 'VOCABULARY', points: 3, score: 1, verdict: 'correct' },
      { skill: 'VOCABULARY', points: 1, score: 0, verdict: 'wrong' },
    ]);
    expect(grade.score).toBeCloseTo(0.75);
  });

  it('an empty assessment scores zero rather than dividing by zero', () => {
    expect(gradeAssessment([])).toMatchObject({ score: 0, total: 0, breakdown: [] });
  });
});

describe('xpForAssessment', () => {
  it('pays 50 for a perfect quiz and 100 for a perfect exam', () => {
    expect(xpForAssessment('QUIZ', 1)).toBe(50);
    expect(xpForAssessment('EXAM', 1)).toBe(100);
    expect(xpForAssessment('EXAM', 0.78)).toBe(78);
    expect(xpForAssessment('QUIZ', 0)).toBe(0);
  });

  it('keeps the score inside 0..1', () => {
    expect(xpForAssessment('EXAM', 1.4)).toBe(100);
    expect(xpForAssessment('EXAM', -1)).toBe(0);
  });
});

describe('weakestSkill', () => {
  it('names the lowest skill under the threshold', () => {
    const breakdown = [
      { skill: 'GRAMMAR' as const, score: 0.5, correct: 1, total: 2 },
      { skill: 'VOCABULARY' as const, score: 0.9, correct: 9, total: 10 },
    ];
    expect(weakestSkill(breakdown)?.skill).toBe('GRAMMAR');
  });

  it('is null when everything went well', () => {
    expect(weakestSkill([{ skill: 'VOCABULARY', score: 0.9, correct: 9, total: 10 }])).toBeNull();
    expect(weakestSkill([])).toBeNull();
  });
});

describe('recommendations', () => {
  it('suggests a quiz once most of the lesson was seen and none was taken this week', () => {
    expect(shouldRecommendQuiz({ itemCount: 10, seenCount: 6, daysSinceLastQuiz: null })).toBe(true);
    expect(shouldRecommendQuiz({ itemCount: 10, seenCount: 5, daysSinceLastQuiz: null })).toBe(false);
    expect(shouldRecommendQuiz({ itemCount: 10, seenCount: 9, daysSinceLastQuiz: 3 })).toBe(false);
    expect(shouldRecommendQuiz({ itemCount: 10, seenCount: 9, daysSinceLastQuiz: 7 })).toBe(true);
    expect(shouldRecommendQuiz({ itemCount: 2, seenCount: 2, daysSinceLastQuiz: null })).toBe(false);
  });

  it('suggests an exam once 80% of a real-sized unit is settled', () => {
    expect(shouldRecommendExam({ itemCount: 10, settledCount: 8 })).toBe(true);
    expect(shouldRecommendExam({ itemCount: 10, settledCount: 7 })).toBe(false);
    expect(shouldRecommendExam({ itemCount: 4, settledCount: 4 })).toBe(false);
  });
});
