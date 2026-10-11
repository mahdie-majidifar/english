import {
  FORMAT_SPECS,
  type ContentOf,
  type Evaluation,
  type ErrorTypeCode,
  type ExerciseFormat,
  type ResponseOf,
  type SolutionOf,
} from '@coach/contracts';
import { compareAnswer, normalizeAnswer, splitAlternatives } from './normalize.js';

const CORRECT = (partial: Partial<Evaluation> = {}): Evaluation => ({
  verdict: 'correct',
  score: 1,
  isCorrect: true,
  errorCodes: [],
  correctAnswerText: null,
  explanationFa: null,
  detail: {},
  needsAi: false,
  ...partial,
});

const WRONG = (partial: Partial<Evaluation> = {}): Evaluation => ({
  verdict: 'wrong',
  score: 0,
  isCorrect: false,
  errorCodes: ['OTHER.OTHER'],
  correctAnswerText: null,
  explanationFa: null,
  detail: {},
  needsAi: false,
  ...partial,
});

const ALMOST_SCORE = 0.8;

const FLASHCARD_SCORES = { 1: 0, 2: 0.6, 3: 1, 4: 1 } as const;

function flashcard(response: ResponseOf['flashcard']): Evaluation {
  const rating = response.rating as 1 | 2 | 3 | 4;
  const score = FLASHCARD_SCORES[rating];
  return {
    verdict: rating === 1 ? 'wrong' : rating === 2 ? 'almost' : 'correct',
    score,
    isCorrect: rating >= 2,
    errorCodes: rating === 1 ? ['VOCAB.MEANING'] : [],
    correctAnswerText: null,
    explanationFa: null,
    detail: { rating },
    needsAi: false,
  };
}

function multipleChoice(
  content: ContentOf['multiple_choice'],
  solution: SolutionOf['multiple_choice'],
  response: ResponseOf['multiple_choice'],
): Evaluation {
  const correctText = content.options.find((o) => o.id === solution.correctOptionId)?.text ?? null;
  const base = {
    correctAnswerText: correctText,
    explanationFa: solution.explanationFa ?? null,
    detail: { correctOptionId: solution.correctOptionId, chosenOptionId: response.optionId },
  };
  if (response.optionId === solution.correctOptionId) return CORRECT(base);
  const known = content.options.some((o) => o.id === response.optionId);
  const code = (known ? solution.distractorErrors[response.optionId] : undefined) ?? 'OTHER.OTHER';
  return WRONG({ ...base, errorCodes: [code as ErrorTypeCode] });
}

function matching(
  content: ContentOf['matching'],
  solution: SolutionOf['matching'],
  response: ResponseOf['matching'],
): Evaluation {
  const leftIds = Object.keys(solution.pairs);
  const results: Record<string, boolean> = {};
  for (const id of leftIds) results[id] = response.pairs[id] === solution.pairs[id];
  const right = new Map(content.right.map((r) => [r.id, r.text]));
  const text = (id: string) => content.left.find((l) => l.id === id)?.text ?? id;
  const correctText = leftIds.map((id) => `${text(id)} → ${right.get(solution.pairs[id]!) ?? ''}`).join('\n');
  const correctCount = leftIds.filter((id) => results[id]).length;
  const detail = { results, correctPairs: solution.pairs };

  if (correctCount === leftIds.length) return CORRECT({ detail, explanationFa: solution.explanationFa ?? null });
  return WRONG({
    score: correctCount / leftIds.length,
    errorCodes: ['VOCAB.MEANING'],
    correctAnswerText: correctText,
    explanationFa: solution.explanationFa ?? null,
    detail,
  });
}

function fillBlank(solution: SolutionOf['fill_blank'], response: ResponseOf['fill_blank']): Evaluation {
  const match = compareAnswer(response.answer, solution.acceptedAnswers);
  const base = {
    correctAnswerText: solution.acceptedAnswers[0]!,
    explanationFa: solution.explanationFa ?? null,
  };
  if (match.verdict === 'correct') return CORRECT(base);
  if (match.verdict === 'almost') {
    return {
      ...CORRECT(base),
      verdict: 'almost',
      score: ALMOST_SCORE,
      errorCodes: ['SPELLING.SPELLING'],
      detail: { matched: match.matched },
    };
  }
  return WRONG({ ...base, errorCodes: [solution.errorCode ?? 'OTHER.OTHER'] });
}

/** Dictation: what was heard, typed. A single word one slip away is "almost"; a sentence must be exact (apart from case and punctuation). */
function listenAndType(solution: SolutionOf['listen_and_type'], response: ResponseOf['listen_and_type']): Evaluation {
  const match = compareAnswer(response.answer, solution.acceptedAnswers);
  const base = { correctAnswerText: solution.acceptedAnswers[0]!, explanationFa: solution.explanationFa ?? null };
  if (match.verdict === 'correct') return CORRECT(base);
  if (match.verdict === 'almost') {
    return { ...CORRECT(base), verdict: 'almost', score: ALMOST_SCORE, errorCodes: ['SPELLING.SPELLING'] };
  }
  return WRONG({ ...base, errorCodes: ['LISTENING.MISHEARD'] });
}

function irregularVerb(
  content: ContentOf['irregular_verb_forms'],
  solution: SolutionOf['irregular_verb_forms'],
  response: ResponseOf['irregular_verb_forms'],
): Evaluation {
  const past = compareAnswer(response.past, splitAlternatives(solution.past));
  const participle = compareAnswer(response.pastParticiple, splitAlternatives(solution.pastParticiple));
  const points = (v: typeof past.verdict) => (v === 'correct' ? 1 : v === 'almost' ? ALMOST_SCORE : 0);
  const score = (points(past.verdict) + points(participle.verdict)) / 2;

  const errorCodes: ErrorTypeCode[] = [];
  if (past.verdict === 'wrong') errorCodes.push('VERB.V2_FORM');
  if (participle.verdict === 'wrong') errorCodes.push('VERB.V3_FORM');
  const bothOk = past.verdict !== 'wrong' && participle.verdict !== 'wrong';
  const bothExact = past.verdict === 'correct' && participle.verdict === 'correct';

  return {
    verdict: bothExact ? 'correct' : bothOk ? 'almost' : 'wrong',
    score,
    isCorrect: bothOk,
    errorCodes: bothOk && !bothExact ? ['SPELLING.SPELLING'] : errorCodes,
    correctAnswerText: `${content.base} → ${solution.past} → ${solution.pastParticiple}`,
    explanationFa: null,
    detail: { past: past.verdict, pastParticiple: participle.verdict },
    needsAi: false,
  };
}

function wordFormation(solution: SolutionOf['word_formation'], response: ResponseOf['word_formation']): Evaluation {
  const match = compareAnswer(response.answer, solution.acceptedAnswers);
  const base = { correctAnswerText: solution.acceptedAnswers[0]!, explanationFa: solution.explanationFa ?? null };
  if (match.verdict === 'correct') return CORRECT(base);
  if (match.verdict === 'almost') {
    return { ...CORRECT(base), verdict: 'almost', score: ALMOST_SCORE, errorCodes: ['SPELLING.SPELLING'] };
  }
  return WRONG({ ...base, errorCodes: ['FORM.WRONG_SUFFIX'] });
}

function sentenceOrder(
  content: ContentOf['sentence_order'],
  solution: SolutionOf['sentence_order'],
  response: ResponseOf['sentence_order'],
): Evaluation {
  const { tokens } = content;
  const valid =
    response.order.length === tokens.length &&
    new Set(response.order).size === tokens.length &&
    response.order.every((i) => i >= 0 && i < tokens.length);
  const base = { correctAnswerText: solution.acceptedSentences[0]!, explanationFa: solution.explanationFa ?? null };
  if (!valid) return WRONG({ ...base, errorCodes: ['GRAMMAR.WORD_ORDER'] });

  const typed = response.order.map((i) => tokens[i]!);
  const typedNorm = normalizeAnswer(typed.join(' '));
  if (solution.acceptedSentences.some((s) => normalizeAnswer(s) === typedNorm)) return CORRECT(base);

  // Point at the first word that is out of place, against the closest accepted sentence.
  const target = normalizeAnswer(solution.acceptedSentences[0]!).split(' ');
  const typedWords = typedNorm.split(' ');
  const firstWrong = typedWords.findIndex((w, i) => w !== target[i]);
  return WRONG({ ...base, errorCodes: ['GRAMMAR.WORD_ORDER'], detail: { firstWrongIndex: Math.max(0, firstWrong) } });
}

/** Free text: an exact match to a model answer is instantly right; anything else goes to the AI evaluator. */
function openAnswer(solution: SolutionOf['free_production'], answer: string): Evaluation {
  const match = compareAnswer(answer, solution.referenceAnswers);
  if (match.verdict === 'correct') {
    return CORRECT({ correctAnswerText: solution.referenceAnswers[0] ?? null, explanationFa: solution.explanationFa ?? null });
  }
  return WRONG({
    needsAi: true,
    correctAnswerText: solution.referenceAnswers[0] ?? null,
    explanationFa: solution.explanationFa ?? null,
  });
}

/**
 * Judges a response with rules only. Deterministic, instant, and testable without any AI.
 * `needsAi` is set for free-text answers that do not match a model answer.
 */
export function evaluateRule(
  format: ExerciseFormat,
  content: unknown,
  solution: unknown,
  response: unknown,
): Evaluation {
  switch (format) {
    case 'flashcard':
      return flashcard(response as ResponseOf['flashcard']);
    case 'multiple_choice':
      return multipleChoice(content as ContentOf['multiple_choice'], solution as SolutionOf['multiple_choice'], response as ResponseOf['multiple_choice']);
    case 'matching':
      return matching(content as ContentOf['matching'], solution as SolutionOf['matching'], response as ResponseOf['matching']);
    case 'fill_blank':
      return fillBlank(solution as SolutionOf['fill_blank'], response as ResponseOf['fill_blank']);
    case 'irregular_verb_forms':
      return irregularVerb(content as ContentOf['irregular_verb_forms'], solution as SolutionOf['irregular_verb_forms'], response as ResponseOf['irregular_verb_forms']);
    case 'word_formation':
      return wordFormation(solution as SolutionOf['word_formation'], response as ResponseOf['word_formation']);
    case 'listen_and_type':
      return listenAndType(solution as SolutionOf['listen_and_type'], response as ResponseOf['listen_and_type']);
    case 'sentence_order':
      return sentenceOrder(content as ContentOf['sentence_order'], solution as SolutionOf['sentence_order'], response as ResponseOf['sentence_order']);
    case 'translation_fa_en':
    case 'free_production':
    case 'transformation':
      return openAnswer(solution as SolutionOf['free_production'], (response as ResponseOf['free_production']).answer);
  }
}

export const isAiFormat = (format: ExerciseFormat): boolean => FORMAT_SPECS[format].evaluation === 'AI';
