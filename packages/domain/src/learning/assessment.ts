import type { AssessmentKind, AssessmentPreset, ExerciseFormat, ExerciseLevel, SkillArea } from '@coach/contracts';
import { chooseExercise } from '../exercises/selection.js';
import { shuffle } from '../exercises/templates.js';

/** How many questions and how many minutes each kind and preset gets (TECHNICAL_PLAN §13-14). */
export const ASSESSMENT_DEFAULTS: Record<AssessmentKind, Partial<Record<AssessmentPreset, { questions: number; minutes: number }>>> = {
  QUIZ: {
    LESSON: { questions: 10, minutes: 10 },
    UNIT: { questions: 15, minutes: 12 },
    WEAK_AREAS: { questions: 10, minutes: 8 },
    WEEKLY: { questions: 12, minutes: 10 },
  },
  EXAM: {
    LESSON: { questions: 15, minutes: 12 },
    UNIT: { questions: 25, minutes: 20 },
    WEEKLY: { questions: 20, minutes: 15 },
    MONTHLY: { questions: 30, minutes: 25 },
  },
};

/** Fewer than this is not an assessment, just a couple of questions. */
export const MIN_QUESTIONS = 3;

/** Seconds the server still accepts an answer after the clock runs out, for slow networks. */
export const GRACE_SECONDS = 30;

/**
 * Formats a quiz or exam never uses: ones that need the AI to be marked (assessments stay fully
 * rule-marked, so they never wait on it) and ones the learner marks themselves (a test must not
 * take your own word for it).
 */
const NOT_IN_ASSESSMENTS: ReadonlySet<ExerciseFormat> = new Set<ExerciseFormat>(['free_production', 'flashcard']);

export interface AssessmentExercise {
  id: string;
  level: ExerciseLevel;
  format: ExerciseFormat;
  skill: SkillArea;
  /** The learner has answered this very question before. */
  answeredBefore: boolean;
}

export interface AssessmentItem {
  id: string;
  /** Weak, being learned, or has an open mistake: the items a quiz leans on. */
  needsWork: boolean;
  level: ExerciseLevel;
  pool: AssessmentExercise[];
}

/** Share of a quiz taken from items that need work; the rest is general coverage. */
export const QUIZ_FOCUS_SHARE = 0.6;

/**
 * Picks which exercises make up an assessment, one per item where it can (more passes if the scope
 * is small). A quiz leans on weak items; an exam samples evenly and prefers questions the learner
 * has never answered, so it measures what they know rather than what they remember from last time.
 */
export function pickQuestions(input: {
  kind: AssessmentKind;
  items: readonly AssessmentItem[];
  count: number;
  rng?: () => number;
  /** Questions answered in the last day (a quiz avoids repeating them). */
  recentlyAnswered?: ReadonlySet<string>;
}): AssessmentExercise[] {
  const rng = input.rng ?? Math.random;
  const items = input.items
    .map((i) => ({ ...i, pool: i.pool.filter((e) => !NOT_IN_ASSESSMENTS.has(e.format)) }))
    .filter((i) => i.pool.length > 0);
  if (items.length === 0 || input.count <= 0) return [];

  const ordered = orderItems(input.kind, items, input.count, rng);
  const isRecent =
    input.kind === 'EXAM'
      ? (e: AssessmentExercise) => e.answeredBefore
      : (e: AssessmentExercise) => input.recentlyAnswered?.has(e.id) ?? false;

  const picked: AssessmentExercise[] = [];
  const used = new Set<string>();
  const recentFormats: ExerciseFormat[] = [];
  const limit = Math.min(input.count, items.reduce((n, i) => n + i.pool.length, 0));

  for (let slot = 0; picked.length < limit && slot < ordered.length * 4; slot++) {
    const item = ordered[slot % ordered.length]!;
    const choice = chooseExercise(
      item.pool.filter((e) => !used.has(e.id)),
      item.level,
      recentFormats.slice(-2),
      rng,
      'PRODUCTION',
      isRecent,
    );
    if (!choice) continue;
    picked.push(choice);
    used.add(choice.id);
    recentFormats.push(choice.format);
  }
  return picked;
}

function orderItems(kind: AssessmentKind, items: AssessmentItem[], count: number, rng: () => number): AssessmentItem[] {
  if (kind === 'EXAM') {
    // Items with a question they have never answered come first.
    const fresh = items.filter((i) => i.pool.some((e) => !e.answeredBefore));
    const stale = items.filter((i) => !i.pool.some((e) => !e.answeredBefore));
    return [...shuffle(fresh, rng), ...shuffle(stale, rng)];
  }
  const focus = shuffle(items.filter((i) => i.needsWork), rng);
  const rest = shuffle(items.filter((i) => !i.needsWork), rng);
  const wantFocus = Math.ceil(count * QUIZ_FOCUS_SHARE);
  const takenFocus = focus.slice(0, wantFocus);
  const takenRest = rest.slice(0, Math.max(count - takenFocus.length, 0));
  const leftover = [...focus.slice(takenFocus.length), ...rest.slice(takenRest.length)];
  return shuffle([...takenFocus, ...takenRest], rng).concat(leftover);
}

// ───────────── Marking ─────────────

export interface MarkedQuestion {
  skill: SkillArea;
  points: number;
  /** null when the question was left unanswered. */
  score: number | null;
  verdict: 'correct' | 'almost' | 'wrong' | null;
}

export interface SkillScore {
  skill: SkillArea;
  /** 0..1 */
  score: number;
  correct: number;
  total: number;
}

export interface AssessmentGrade {
  /** 0..1 over all questions, unanswered counting as zero. */
  score: number;
  total: number;
  correct: number;
  almost: number;
  wrong: number;
  unanswered: number;
  breakdown: SkillScore[];
}

export function gradeAssessment(questions: readonly MarkedQuestion[]): AssessmentGrade {
  const weight = (list: readonly MarkedQuestion[]) => list.reduce((s, q) => s + q.points, 0);
  const earned = (list: readonly MarkedQuestion[]) => list.reduce((s, q) => s + q.points * (q.score ?? 0), 0);
  const ratio = (list: readonly MarkedQuestion[]) => (weight(list) === 0 ? 0 : earned(list) / weight(list));
  const count = (v: MarkedQuestion['verdict']) => questions.filter((q) => q.verdict === v).length;

  const skills = [...new Set(questions.map((q) => q.skill))];
  return {
    score: ratio(questions),
    total: questions.length,
    correct: count('correct'),
    almost: count('almost'),
    wrong: count('wrong'),
    unanswered: questions.filter((q) => q.verdict === null).length,
    breakdown: skills
      .map((skill) => {
        const group = questions.filter((q) => q.skill === skill);
        return { skill, score: ratio(group), correct: group.filter((q) => q.verdict === 'correct').length, total: group.length };
      })
      .sort((a, b) => a.score - b.score || b.total - a.total),
  };
}

/** Quiz: score × 50. Exam: score × 100. Answers inside an assessment earn no XP of their own. */
export function xpForAssessment(kind: AssessmentKind, score: number): number {
  return Math.round(Math.min(Math.max(score, 0), 1) * (kind === 'QUIZ' ? 50 : 100));
}

/** The skill most worth practising next, or null when every skill went well. */
export function weakestSkill(breakdown: readonly SkillScore[], threshold = 0.8): SkillScore | null {
  const weak = breakdown.filter((b) => b.total > 0 && b.score < threshold);
  if (weak.length === 0) return null;
  return [...weak].sort((a, b) => a.score - b.score || b.total - a.total)[0]!;
}

// ───────────── Recommendations ─────────────

/** Quiz when most of the lesson has been seen and there has been no quiz this week. */
export function shouldRecommendQuiz(input: { itemCount: number; seenCount: number; daysSinceLastQuiz: number | null }): boolean {
  if (input.itemCount < MIN_QUESTIONS) return false;
  return input.seenCount / input.itemCount >= 0.6 && (input.daysSinceLastQuiz === null || input.daysSinceLastQuiz >= 7);
}

/** Exam when most of the unit has settled into review or better. */
export function shouldRecommendExam(input: { itemCount: number; settledCount: number }): boolean {
  if (input.itemCount < 5) return false;
  return input.settledCount / input.itemCount >= 0.8;
}
