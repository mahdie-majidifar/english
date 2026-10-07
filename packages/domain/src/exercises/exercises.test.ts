import { describe, expect, it } from 'vitest';
import {
  FORMAT_SPECS,
  parseExerciseParts,
  type ContentOf,
  type ExerciseFormat,
  type SolutionOf,
} from '@coach/contracts';
import { evaluateRule } from './evaluate.js';
import { compareAnswer, editDistance, normalizeAnswer } from './normalize.js';
import { chooseExercise } from './selection.js';
import {
  findInSentence,
  generateMatching,
  generateTemplates,
  seededRng,
  type ExerciseDraft,
  type ItemInput,
} from './templates.js';

// ───────────── normalize ─────────────

describe('normalizeAnswer', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeAnswer('  She SAID, that...  ')).toBe('she said that');
  });

  it('treats contractions and their full forms as the same', () => {
    expect(normalizeAnswer("she hadn't bought")).toBe(normalizeAnswer('she had not bought'));
    expect(normalizeAnswer("I'm sure")).toBe(normalizeAnswer('I am sure'));
    expect(normalizeAnswer("can't")).toBe(normalizeAnswer('cannot'));
    expect(normalizeAnswer("won't")).toBe(normalizeAnswer('will not'));
    expect(normalizeAnswer('it’s')).toBe("it's"); // curly apostrophe
  });
});

describe('compareAnswer', () => {
  it('accepts exact, differently-cased answers', () => {
    expect(compareAnswer('Negotiated', ['negotiated']).verdict).toBe('correct');
  });

  it('calls a one-letter slip in a long single word "almost"', () => {
    expect(compareAnswer('negociated', ['negotiated']).verdict).toBe('almost');
    expect(compareAnswer('failur', ['failure']).verdict).toBe('almost');
  });

  it('never mistakes a wrong grammatical form for a typo', () => {
    expect(compareAnswer('negotiate', ['negotiated']).verdict).toBe('wrong');
    expect(compareAnswer('negotiates', ['negotiated']).verdict).toBe('wrong');
    expect(compareAnswer('worked', ['working']).verdict).toBe('wrong');
    expect(compareAnswer('negociated', ['negotiated']).verdict).toBe('almost'); // a real slip
  });

  it('never forgives short words or sentences', () => {
    expect(compareAnswer('wore', ['worn']).verdict).toBe('wrong');
    expect(compareAnswer('she has bought', ['she had bought']).verdict).toBe('wrong');
    expect(compareAnswer('', ['x']).verdict).toBe('wrong');
  });

  it('allows several accepted answers', () => {
    expect(compareAnswer('learned', ['learnt', 'learned']).verdict).toBe('correct');
  });

  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

// ───────────── findInSentence ─────────────

describe('findInSentence', () => {
  it('finds a word and its regular inflections', () => {
    expect(findInSentence('We negotiated a discount.', 'negotiate')?.surface).toBe('negotiated');
    expect(findInSentence('She is negotiating now.', 'negotiate')?.surface).toBe('negotiating');
    expect(findInSentence('Negotiate hard.', 'negotiate')?.surface).toBe('Negotiate');
    expect(findInSentence('He studies at night.', 'study')?.surface).toBe('studies');
    expect(findInSentence('They stopped talking.', 'stop')?.surface).toBe('stopped');
  });

  it('does not mistake a different word of the same family for the word', () => {
    expect(findInSentence('The negotiation took hours.', 'negotiate')).toBeNull();
  });

  it('finds phrases and reports positions', () => {
    const m = findInSentence('I could not resist the cake.', 'not resist');
    expect(m?.surface).toBe('not resist');
    expect(findInSentence('Nothing here.', 'negotiate')).toBeNull();
  });
});

// ───────────── templates ─────────────

const item = (patch: Partial<ItemInput> & Pick<ItemInput, 'id' | 'type' | 'headword'>): ItemInput => ({
  meaningEn: null,
  meaningFa: null,
  payload: {},
  ...patch,
});

const LIBRARY: ItemInput[] = [
  item({
    id: 'i-negotiate',
    type: 'VOCABULARY',
    headword: 'negotiate',
    meaningFa: 'مذاکره کردن',
    meaningEn: 'to discuss to reach an agreement',
    payload: { examples: ['We negotiated a big discount yesterday.', 'Short one.'] },
  }),
  item({ id: 'i-strictly', type: 'VOCABULARY', headword: 'strictly', meaningFa: 'به‌طور سخت‌گیرانه', payload: { examples: [] } }),
  item({ id: 'i-weird', type: 'VOCABULARY', headword: 'weird', meaningFa: 'عجیب', payload: {} }),
  item({ id: 'i-static', type: 'VOCABULARY', headword: 'static', meaningFa: 'ثابت', payload: {} }),
  item({
    id: 'i-colloc',
    type: 'COLLOCATION',
    headword: 'negotiate a discount',
    meaningFa: 'تخفیف گرفتن',
    payload: { examples: ['Learn how to negotiate a discount when you travel.'] },
  }),
  item({
    id: 'i-wear',
    type: 'IRREGULAR_VERB',
    headword: 'wear',
    meaningFa: 'پوشیدن',
    payload: { base: 'wear', past: 'wore', pastParticiple: 'worn' },
  }),
  item({
    id: 'i-fail',
    type: 'WORD_FORMATION',
    headword: 'fail',
    payload: {
      base: 'fail',
      forms: [
        { form: 'failure', pos: 'noun' },
        { form: 'failed', pos: 'adjective' },
      ],
    },
  }),
  item({
    id: 'i-fit',
    type: 'WORD_DISTINCTION',
    headword: 'fit / suit / match',
    payload: {
      members: ['fit', 'suit', 'match'],
      distinctions: [
        { word: 'fit', usageFa: 'اندازه بودن', example: 'These shoes fit me perfectly.' },
        { word: 'suit', usageFa: 'به کسی آمدن', example: 'That blue colour really suits you.' },
      ],
    },
  }),
  item({
    id: 'i-reported',
    type: 'GRAMMAR',
    headword: 'Reported speech',
    meaningFa: 'نقل‌قول غیرمستقیم',
    payload: { structure: 'say that + backshift', examples: ['She said that she had bought me a present.'] },
  }),
];

const draftsFor = (id: string) => {
  const target = LIBRARY.find((i) => i.id === id)!;
  return generateTemplates(target, LIBRARY);
};

/** The response a perfect learner would give. */
function perfectResponse(draft: ExerciseDraft): unknown {
  const content = draft.content as Record<string, unknown>;
  const solution = draft.solution as Record<string, unknown>;
  switch (draft.format) {
    case 'flashcard':
      return { rating: 3 };
    case 'multiple_choice':
      return { optionId: (solution as SolutionOf['multiple_choice']).correctOptionId };
    case 'matching':
      return { pairs: (solution as SolutionOf['matching']).pairs };
    case 'fill_blank':
      return { answer: (solution as SolutionOf['fill_blank']).acceptedAnswers[0] };
    case 'irregular_verb_forms':
      return { past: solution['past'], pastParticiple: solution['pastParticiple'] };
    case 'word_formation':
      return { answer: (solution as SolutionOf['word_formation']).acceptedAnswers[0] };
    case 'sentence_order': {
      const tokens = (content as ContentOf['sentence_order']).tokens;
      const target = (solution as SolutionOf['sentence_order']).acceptedSentences[0]!.replace(/[.!?]+$/, '').split(/\s+/);
      const used = new Set<number>();
      return {
        order: target.map((word) => {
          const index = tokens.findIndex((t, i) => t === word && !used.has(i));
          used.add(index);
          return index;
        }),
      };
    }
    default:
      throw new Error(`no perfect response for ${draft.format}`);
  }
}

describe('generateTemplates', () => {
  const all = LIBRARY.flatMap((i) => generateTemplates(i, LIBRARY));

  it('makes a sensible set of exercises from a rich library', () => {
    const formats = new Set(all.map((d) => d.format));
    for (const f of ['flashcard', 'multiple_choice', 'fill_blank', 'irregular_verb_forms', 'word_formation', 'sentence_order'] as ExerciseFormat[]) {
      expect(formats.has(f), f).toBe(true);
    }
  });

  it('only produces exercises that fit their format contract', () => {
    for (const d of all) {
      const parsed = parseExerciseParts(d.format, d.content, d.solution);
      expect(parsed.success, `${d.key}: ${!parsed.success && parsed.error}`).toBe(true);
      expect(FORMAT_SPECS[d.format].evaluation, d.key).toBe('RULE'); // templates never need AI
      expect(d.itemIds.length).toBeGreaterThan(0);
    }
  });

  it('gives every exercise a verb-first instruction and a how-to line', () => {
    for (const d of all) {
      const c = d.content as { instruction: string; helper?: string };
      expect(c.instruction, d.key).toMatch(/^[A-Z][a-z]+ /);
      expect(c.helper?.length ?? 0, d.key).toBeGreaterThan(10);
    }
  });

  it('is deterministic, so regenerating never creates duplicates', () => {
    const again = LIBRARY.flatMap((i) => generateTemplates(i, LIBRARY));
    expect(again.map((d) => d.key)).toEqual(all.map((d) => d.key));
    expect(new Set(all.map((d) => d.key)).size).toBe(all.length); // keys are unique
  });

  it('marks a perfect answer correct for every rule-checkable exercise', () => {
    for (const d of all) {
      if (d.format === 'matching') continue;
      const result = evaluateRule(d.format, d.content, d.solution, perfectResponse(d));
      expect(result.isCorrect, d.key).toBe(true);
      expect(result.needsAi).toBe(false);
    }
  });

  it('never gives away the answer in the learner-facing content', () => {
    for (const d of all) {
      expect(JSON.stringify(d.content)).not.toContain('correctOptionId');
      expect(JSON.stringify(d.content)).not.toContain('acceptedAnswers');
    }
  });

  it('builds fill-in-the-blank from an example, using the inflected form and a base-form hint', () => {
    const fb = draftsFor('i-negotiate').find((d) => d.key.startsWith('fb-ctx'))!;
    const c = fb.content as ContentOf['fill_blank'];
    expect(c.sentence).toBe('We ___ a big discount yesterday.');
    expect(c.hint).toBe('(negotiate)');
    expect((fb.solution as SolutionOf['fill_blank']).acceptedAnswers).toEqual(['negotiated']);
    expect(c.sentenceFa).toBe('مذاکره کردن');
    // The short example (fewer than 4 words) is not used.
    expect(draftsFor('i-negotiate').filter((d) => d.key.startsWith('fb-ctx'))).toHaveLength(1);
  });

  it('asks for the most meaningful word of a collocation', () => {
    const d = draftsFor('i-colloc').find((x) => x.key.startsWith('fb-colloc'))!;
    expect((d.content as ContentOf['fill_blank']).sentence).toBe('negotiate a ___');
    expect((d.solution as SolutionOf['fill_blank']).acceptedAnswers).toEqual(['discount']);
  });

  it('turns word distinctions into gap-fill choices with explanations', () => {
    const d = draftsFor('i-fit').filter((x) => x.key.startsWith('dist|'));
    expect(d).toHaveLength(2);
    const first = d[0]!.content as ContentOf['multiple_choice'];
    expect(first.prompt).toBe('These shoes ___ me perfectly.');
    expect(first.options.map((o) => o.text).sort()).toEqual(['fit', 'match', 'suit']);
    expect((d[0]!.solution as SolutionOf['multiple_choice']).explanationFa).toContain('اندازه بودن');
  });

  it('shuffles sentence order so it differs from the original', () => {
    const so = draftsFor('i-reported').find((d) => d.format === 'sentence_order')!;
    const tokens = (so.content as ContentOf['sentence_order']).tokens;
    expect(tokens.join(' ')).not.toBe('She said that she had bought me a present');
    expect([...tokens].sort()).toEqual('She said that she had bought me a present'.split(' ').sort());
  });

  it('skips multiple choice when there are not enough distractors', () => {
    const lonely = item({ id: 'x', type: 'VOCABULARY', headword: 'solo', meaningFa: 'تنها' });
    const drafts = generateTemplates(lonely, [lonely]);
    expect(drafts.some((d) => d.format === 'multiple_choice')).toBe(false);
    expect(drafts.some((d) => d.format === 'flashcard')).toBe(true);
  });

  it('puts the right answer at a varying position, with unique option ids', () => {
    const positions = new Set<string>();
    for (const i of LIBRARY) {
      for (const d of generateTemplates(i, LIBRARY).filter((x) => x.format === 'multiple_choice')) {
        const c = d.content as ContentOf['multiple_choice'];
        expect(new Set(c.options.map((o) => o.id)).size).toBe(c.options.length);
        positions.add((d.solution as SolutionOf['multiple_choice']).correctOptionId);
      }
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('generateMatching', () => {
  it('pairs items with their meanings and shuffles the right column', () => {
    const d = generateMatching(LIBRARY.filter((i) => i.type === 'VOCABULARY'))!;
    expect(d.format).toBe('matching');
    const c = d.content as ContentOf['matching'];
    expect(c.left).toHaveLength(4);
    const pairs = (d.solution as SolutionOf['matching']).pairs;
    const result = evaluateRule('matching', d.content, d.solution, { pairs });
    expect(result.isCorrect).toBe(true);
    // Swapping two pairs is wrong and reports which ones were right.
    const [a, b] = Object.keys(pairs);
    const swapped = { ...pairs, [a!]: pairs[b!]!, [b!]: pairs[a!]! };
    const wrong = evaluateRule('matching', d.content, d.solution, { pairs: swapped });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.score).toBeCloseTo(0.5);
    expect(Object.values(wrong.detail['results'] as Record<string, boolean>).filter(Boolean)).toHaveLength(2);
  });

  it('needs at least three items with meanings', () => {
    expect(generateMatching(LIBRARY.slice(0, 2))).toBeNull();
    expect(generateMatching(LIBRARY.filter((i) => !i.meaningFa))).toBeNull();
  });
});

// ───────────── evaluate ─────────────

describe('evaluateRule', () => {
  it('multiple choice: names the kind of mistake a wrong option represents', () => {
    const d = draftsFor('i-fit').find((x) => x.key.startsWith('dist|'))!;
    const sol = d.solution as SolutionOf['multiple_choice'];
    const wrongId = Object.keys(sol.distractorErrors)[0]!;
    const result = evaluateRule('multiple_choice', d.content, d.solution, { optionId: wrongId });
    expect(result).toMatchObject({ isCorrect: false, verdict: 'wrong', errorCodes: ['VOCAB.CONFUSABLE'] });
    expect(result.correctAnswerText).toBe('fit');
    expect(result.detail['chosenOptionId']).toBe(wrongId);
  });

  it('multiple choice: an option that does not exist is simply wrong', () => {
    const d = draftsFor('i-fit').find((x) => x.key.startsWith('dist|'))!;
    expect(evaluateRule('multiple_choice', d.content, d.solution, { optionId: 'zzz' }).isCorrect).toBe(false);
  });

  it('flashcard: maps the self-rating to a score', () => {
    expect(evaluateRule('flashcard', {}, {}, { rating: 1 })).toMatchObject({ isCorrect: false, score: 0, verdict: 'wrong' });
    expect(evaluateRule('flashcard', {}, {}, { rating: 2 })).toMatchObject({ isCorrect: true, score: 0.6, verdict: 'almost' });
    expect(evaluateRule('flashcard', {}, {}, { rating: 4 })).toMatchObject({ isCorrect: true, score: 1, verdict: 'correct' });
  });

  it('fill blank: separates correct, almost (typo) and wrong, and shows the answer', () => {
    const d = draftsFor('i-negotiate').find((x) => x.key.startsWith('fb-ctx'))!;
    const check = (answer: string) => evaluateRule('fill_blank', d.content, d.solution, { answer });
    expect(check('negotiated').verdict).toBe('correct');
    expect(check('Negotiated.').verdict).toBe('correct');
    const typo = check('negociated');
    expect(typo).toMatchObject({ verdict: 'almost', isCorrect: true, score: 0.8, errorCodes: ['SPELLING.SPELLING'] });
    const wrong = check('negotiate'); // right word, wrong form: a grammar mistake, not a typo
    expect(wrong).toMatchObject({ verdict: 'wrong', isCorrect: false, correctAnswerText: 'negotiated' });
  });

  it('irregular verbs: scores each form and reports which one was wrong', () => {
    const d = draftsFor('i-wear').find((x) => x.format === 'irregular_verb_forms')!;
    const check = (past: string, pastParticiple: string) =>
      evaluateRule('irregular_verb_forms', d.content, d.solution, { past, pastParticiple });
    expect(check('wore', 'worn').verdict).toBe('correct');
    const half = check('wore', 'wore');
    expect(half).toMatchObject({ isCorrect: false, score: 0.5, errorCodes: ['VERB.V3_FORM'] });
    expect(half.detail).toEqual({ past: 'correct', pastParticiple: 'wrong' });
    expect(check('weared', 'weared').errorCodes).toEqual(['VERB.V2_FORM', 'VERB.V3_FORM']);
    expect(half.correctAnswerText).toBe('wear → wore → worn');
  });

  it('irregular verbs: accepts either spelling when a solution lists alternatives', () => {
    const solution = { past: 'learnt/learned', pastParticiple: 'learnt/learned' };
    const r = evaluateRule('irregular_verb_forms', { base: 'learn' }, solution, { past: 'learned', pastParticiple: 'learnt' });
    expect(r.verdict).toBe('correct');
  });

  it('word formation: accepts the right form, flags the wrong suffix', () => {
    const d = draftsFor('i-fail').find((x) => x.key === 'wf|i-fail|noun')!;
    expect(evaluateRule('word_formation', d.content, d.solution, { answer: 'failure' }).verdict).toBe('correct');
    const wrong = evaluateRule('word_formation', d.content, d.solution, { answer: 'failment' });
    expect(wrong.errorCodes).toEqual(['FORM.WRONG_SUFFIX']);
  });

  it('sentence order: checks the order, points at the first wrong word, rejects malformed responses', () => {
    const d = draftsFor('i-reported').find((x) => x.format === 'sentence_order')!;
    const tokens = (d.content as ContentOf['sentence_order']).tokens;
    const perfect = perfectResponse(d) as { order: number[] };
    expect(evaluateRule('sentence_order', d.content, d.solution, perfect).verdict).toBe('correct');

    const reversed = { order: [...perfect.order].reverse() };
    const wrong = evaluateRule('sentence_order', d.content, d.solution, reversed);
    expect(wrong).toMatchObject({ isCorrect: false, errorCodes: ['GRAMMAR.WORD_ORDER'], correctAnswerText: 'She said that she had bought me a present.' });
    expect(wrong.detail['firstWrongIndex']).toBe(0);

    // Missing words, repeated indices and out-of-range indices are all just wrong, never a crash.
    expect(evaluateRule('sentence_order', d.content, d.solution, { order: [0, 1] }).isCorrect).toBe(false);
    expect(evaluateRule('sentence_order', d.content, d.solution, { order: tokens.map(() => 0) }).isCorrect).toBe(false);
    expect(evaluateRule('sentence_order', d.content, d.solution, { order: tokens.map((_, i) => i + 50) }).isCorrect).toBe(false);
  });

  it('free text: an exact model answer is right instantly, anything else goes to the AI evaluator', () => {
    const solution = { referenceAnswers: ['She said that she had not bought me a present.'] };
    const exact = evaluateRule('transformation', {}, solution, { answer: "She said that she hadn't bought me a present" });
    expect(exact).toMatchObject({ isCorrect: true, needsAi: false });
    const other = evaluateRule('transformation', {}, solution, { answer: 'She told me she did not buy a gift.' });
    expect(other.needsAi).toBe(true);
    expect(other.correctAnswerText).toBe(solution.referenceAnswers[0]);
  });
});

// ───────────── selection ─────────────

describe('chooseExercise', () => {
  const make = (level: ExerciseDraft['level'], format: ExerciseFormat) => ({ level, format });
  const rng = seededRng('test');

  it('prefers the target level and avoids recently shown formats', () => {
    const pool = [make('RECALL', 'fill_blank'), make('RECALL', 'word_formation'), make('RECOGNITION', 'flashcard')];
    expect(chooseExercise(pool, 'RECALL', ['fill_blank'], rng)).toEqual(make('RECALL', 'word_formation'));
  });

  it('falls back to the nearest level, easier first on a tie', () => {
    const pool = [make('RECOGNITION', 'flashcard'), make('CONTEXT', 'sentence_order')];
    expect(chooseExercise(pool, 'RECALL', [], rng)).toEqual(make('RECOGNITION', 'flashcard'));
    expect(chooseExercise([make('CONTEXT', 'sentence_order')], 'RECOGNITION', [], rng)).toEqual(make('CONTEXT', 'sentence_order'));
  });

  it('keeps the level even when every exercise there was answered recently', () => {
    const recall = { ...make('RECALL', 'fill_blank'), id: 'r' };
    const easy = { ...make('RECOGNITION', 'flashcard'), id: 'e' };
    const picked = chooseExercise([recall, easy], 'RECALL', [], rng, 'PRODUCTION', (c) => c.id === 'r');
    expect(picked).toBe(recall); // fit beats freshness
    const two = [recall, { ...make('RECALL', 'word_formation'), id: 'w' }];
    expect(chooseExercise(two, 'RECALL', [], rng, 'PRODUCTION', (c) => c.id === 'r')?.id).toBe('w'); // fresh preferred within the level
  });

  it('can be told not to go harder than a ceiling', () => {
    const pool = [make('CONTEXT', 'sentence_order'), make('PRODUCTION', 'free_production')];
    expect(chooseExercise(pool, 'RECOGNITION', [], rng, 'RECALL')).toBeNull();
    expect(chooseExercise(pool, 'RECOGNITION', [], rng, 'CONTEXT')).toEqual(make('CONTEXT', 'sentence_order'));
  });

  it('repeats a format rather than returning nothing, and returns null for an empty pool', () => {
    const pool = [make('RECALL', 'fill_blank')];
    expect(chooseExercise(pool, 'RECALL', ['fill_blank'], rng)).toEqual(pool[0]);
    expect(chooseExercise([], 'RECALL', [], rng)).toBeNull();
  });
});
