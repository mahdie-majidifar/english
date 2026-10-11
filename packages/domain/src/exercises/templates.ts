import {
  ITEM_TYPE_META,
  type ExerciseFormat,
  type ExerciseLevel,
  type ItemType,
  type SkillArea,
} from '@coach/contracts';

/** What the generators need to know about a learning item. No database types: this stays pure. */
export interface ItemInput {
  id: string;
  type: ItemType;
  headword: string;
  meaningEn: string | null;
  meaningFa: string | null;
  payload: Record<string, unknown>;
}

export interface ExerciseDraft {
  format: ExerciseFormat;
  level: ExerciseLevel;
  skill: SkillArea;
  content: unknown;
  solution: unknown;
  /** Items practised. The first one is the main one. */
  itemIds: string[];
  /** Stable identity of this exercise. The same key always means the same question. */
  key: string;
}

// ───────────── Small deterministic helpers ─────────────

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Same seed, same sequence. Generation is deterministic so re-running it never creates duplicates. */
export function seededRng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const SKILL_BY_TYPE: Record<ItemType, SkillArea> = {
  VOCABULARY: 'VOCABULARY',
  COLLOCATION: 'COLLOCATION',
  GRAMMAR: 'GRAMMAR',
  EXPRESSION: 'EXPRESSION',
  WORD_FORMATION: 'WORD_FORMATION',
  IRREGULAR_VERB: 'GRAMMAR',
  WORD_DISTINCTION: 'GRAMMAR',
  SENTENCE_PATTERN: 'GRAMMAR',
  PRONUNCIATION: 'PRONUNCIATION',
};
export const skillForType = (type: ItemType): SkillArea => SKILL_BY_TYPE[type];

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'];

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : [];

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = (sentence: string) => sentence.trim().split(/\s+/).filter(Boolean);

/** Inflected forms of a regular word, most specific first: negotiate → negotiated, negotiating, negotiates. */
function inflections(word: string): string[] {
  const w = word.toLowerCase();
  const last = w.slice(-1);
  const forms = [w, `${w}s`, `${w}es`, `${w}ed`, `${w}ing`];
  if (w.endsWith('e')) forms.push(`${w}d`, `${w.slice(0, -1)}ing`);
  if (w.endsWith('y')) forms.push(`${w.slice(0, -1)}ies`, `${w.slice(0, -1)}ied`);
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) forms.push(`${w}${last}ed`, `${w}${last}ing`);
  return [...new Set(forms)];
}

export interface SentenceMatch {
  /** The text as it appears in the sentence (keeps its capitals and ending). */
  surface: string;
  start: number;
  end: number;
}

/** Finds the word or phrase in a sentence, also in a regular inflected form. */
export function findInSentence(sentence: string, headword: string): SentenceMatch | null {
  const hw = headword.trim();
  if (!hw) return null;
  const forms = /\s/.test(hw) ? [hw] : inflections(hw);
  for (const form of forms) {
    const m = new RegExp(`(?<![\\p{L}'])${escapeRegExp(form)}(?![\\p{L}'])`, 'iu').exec(sentence);
    if (m) return { surface: m[0], start: m.index, end: m.index + m[0].length };
  }
  return null;
}

const blankOut = (sentence: string, m: SentenceMatch) => `${sentence.slice(0, m.start)}___${sentence.slice(m.end)}`;

const persianMeaning = (item: ItemInput) => item.meaningFa ?? undefined;

// ───────────── Generators ─────────────

function flashcard(item: ItemInput): ExerciseDraft | null {
  const p = item.payload;
  const details: string[] = [];
  const examples = strings(p['examples']);

  switch (item.type) {
    case 'IRREGULAR_VERB':
      details.push(`${p['base'] ?? item.headword} → ${p['past']} → ${p['pastParticiple']}`);
      break;
    case 'GRAMMAR':
    case 'SENTENCE_PATTERN': {
      const structure = (p['structure'] ?? p['pattern']) as string | undefined;
      if (structure) details.push(structure);
      details.push(...examples.slice(0, 2));
      break;
    }
    case 'WORD_FORMATION':
      details.push(...records(p['forms']).map((f) => `${f['form']} (${f['pos']})`));
      break;
    case 'WORD_DISTINCTION':
      details.push(...records(p['distinctions']).map((d) => `${d['word']}: ${d['usageFa'] ?? ''}`.trim()));
      break;
    default:
      details.push(...examples.slice(0, 2));
  }
  if (!item.meaningFa && !item.meaningEn && details.length === 0) return null;

  return {
    format: 'flashcard',
    level: 'RECOGNITION',
    skill: skillForType(item.type),
    itemIds: [item.id],
    key: `flashcard|${item.id}`,
    content: {
      instruction: 'Recall the meaning, then flip the card.',
      helper: 'Tap the card to see the answer, then rate how well you knew it.',
      front: {
        text: item.headword,
        ipa: typeof p['ipa'] === 'string' ? p['ipa'] : undefined,
        note: ITEM_TYPE_META[item.type].label,
      },
      back: { meaningFa: item.meaningFa ?? undefined, meaningEn: item.meaningEn ?? undefined, details },
    },
    solution: {},
  };
}

/** Distractors: other items' meanings or words, same type first, never the right answer. */
function pickDistractors<T>(
  item: ItemInput,
  others: ItemInput[],
  pick: (o: ItemInput) => T | null,
  same: (a: T, b: T) => boolean,
  correct: T,
  rng: () => number,
  max: number,
): T[] {
  const ranked = [
    ...shuffle(others.filter((o) => o.type === item.type), rng),
    ...shuffle(others.filter((o) => o.type !== item.type), rng),
  ];
  const out: T[] = [];
  for (const o of ranked) {
    const value = pick(o);
    if (value === null || same(value, correct) || out.some((x) => same(x, value))) continue;
    out.push(value);
    if (out.length === max) break;
  }
  return out;
}

function optionsWithAnswer(correct: string, distractors: string[], rng: () => number, rtl: boolean) {
  const all = shuffle([correct, ...distractors], rng);
  const options = all.map((text, i) => ({ id: OPTION_IDS[i]!, text, ...(rtl ? { rtl: true } : {}) }));
  const correctOptionId = options.find((o) => o.text === correct)!.id;
  const distractorErrors = Object.fromEntries(options.filter((o) => o.id !== correctOptionId).map((o) => [o.id, 'VOCAB.MEANING']));
  return { options, correctOptionId, distractorErrors };
}

function meaningChoice(item: ItemInput, others: ItemInput[]): ExerciseDraft | null {
  const meaning = item.meaningFa?.trim();
  if (!meaning) return null;
  const rng = seededRng(`${item.id}|mc-meaning`);
  const distractors = pickDistractors<string>(item, others, (o) => o.meaningFa?.trim() || null, (a, b) => a === b, meaning, rng, 3);
  if (distractors.length < 2) return null;
  const { options, correctOptionId, distractorErrors } = optionsWithAnswer(meaning, distractors, rng, true);
  return {
    format: 'multiple_choice',
    level: 'RECOGNITION',
    skill: skillForType(item.type),
    itemIds: [item.id],
    key: `mc-meaning|${item.id}|${[...options.map((o) => o.text)].sort().join('~')}`,
    content: {
      instruction: 'Choose the correct meaning.',
      helper: 'Tap the answer you think is right, then press Check.',
      prompt: item.headword,
      options,
    },
    solution: {
      correctOptionId,
      distractorErrors,
      explanationFa: `«${item.headword}» یعنی «${meaning}».`,
    },
  };
}

function wordChoice(item: ItemInput, others: ItemInput[]): ExerciseDraft | null {
  const meaning = item.meaningFa?.trim();
  if (!meaning) return null;
  const rng = seededRng(`${item.id}|mc-word`);
  const distractors = pickDistractors<string>(item, others, (o) => o.headword.trim() || null, (a, b) => a.toLowerCase() === b.toLowerCase(), item.headword, rng, 3);
  if (distractors.length < 2) return null;
  const { options, correctOptionId, distractorErrors } = optionsWithAnswer(item.headword, distractors, rng, false);
  return {
    format: 'multiple_choice',
    level: 'RECALL',
    skill: skillForType(item.type),
    itemIds: [item.id],
    key: `mc-word|${item.id}|${[...options.map((o) => o.text)].sort().join('~')}`,
    content: {
      instruction: 'Choose the English word for this meaning.',
      helper: 'Read the meaning, then tap the word that matches.',
      prompt: 'Which word matches this meaning?',
      promptFa: meaning,
      options,
    },
    solution: {
      correctOptionId,
      distractorErrors,
      explanationFa: `«${meaning}» یعنی «${item.headword}».`,
    },
  };
}

function wordRecall(item: ItemInput): ExerciseDraft | null {
  const meaning = item.meaningFa?.trim();
  if (!meaning || !['VOCABULARY', 'EXPRESSION', 'COLLOCATION'].includes(item.type)) return null;
  const phrase = /\s/.test(item.headword.trim());
  return {
    format: 'fill_blank',
    level: 'RECALL',
    skill: skillForType(item.type),
    itemIds: [item.id],
    key: `fb-recall|${item.id}`,
    content: {
      instruction: phrase ? 'Type the English phrase for this meaning.' : 'Type the English word for this meaning.',
      helper: 'Write it in English, then press Check.',
      sentence: 'In English: ___',
      sentenceFa: meaning,
    },
    solution: {
      acceptedAnswers: [item.headword.trim()],
      explanationFa: `«${meaning}» یعنی «${item.headword}».`,
      errorCode: item.type === 'COLLOCATION' ? 'VOCAB.WRONG_COLLOCATE' : 'VOCAB.MEANING',
    },
  };
}

function fillBlankFromExamples(item: ItemInput): ExerciseDraft[] {
  if (!['VOCABULARY', 'COLLOCATION', 'EXPRESSION', 'PRONUNCIATION'].includes(item.type)) return [];
  const out: ExerciseDraft[] = [];
  for (const sentence of strings(item.payload['examples']).slice(0, 3)) {
    if (wordsOf(sentence).length < 4) continue;
    const found = findInSentence(sentence, item.headword);
    if (!found) continue;
    const single = !/\s/.test(item.headword.trim());
    const inflected = found.surface.toLowerCase() !== item.headword.trim().toLowerCase();
    const meaning = persianMeaning(item);
    out.push({
      format: 'fill_blank',
      level: 'CONTEXT',
      skill: skillForType(item.type),
      itemIds: [item.id],
      key: `fb-ctx|${item.id}|${sentence}`,
      content: {
        instruction: single ? 'Type the missing word.' : 'Type the missing phrase.',
        helper: single && inflected ? 'Use the sentence to decide. The word in brackets is the base form.' : 'Use the sentence to decide which word fits.',
        sentence: blankOut(sentence, found),
        sentenceFa: meaning,
        hint: single && inflected ? `(${item.headword.trim()})` : undefined,
      },
      solution: {
        acceptedAnswers: [found.surface],
        explanationFa: meaning ? `«${found.surface}» — ${meaning}` : undefined,
        errorCode: item.type === 'COLLOCATION' ? 'VOCAB.WRONG_COLLOCATE' : 'OTHER.OTHER',
      },
    });
  }
  return out;
}

function collocationCompletion(item: ItemInput): ExerciseDraft | null {
  if (item.type !== 'COLLOCATION') return null;
  const words = wordsOf(item.headword);
  if (words.length < 2) return null;
  // Blank the partner word: the last word with real content ("negotiate a ___", "take ___ in").
  const letters = (w: string) => w.replace(/[^\p{L}]/gu, '').length;
  let target = -1;
  for (const min of [4, 3]) {
    for (let i = words.length - 1; i >= 0 && target === -1; i--) if (letters(words[i]!) >= min) target = i;
    if (target !== -1) break;
  }
  if (target === -1) return null;  const answer = words[target]!.replace(/[.,;:!?]+$/, '');
  const sentence = words.map((w, i) => (i === target ? '___' : w)).join(' ');
  return {
    format: 'fill_blank',
    level: 'RECALL',
    skill: 'COLLOCATION',
    itemIds: [item.id],
    key: `fb-colloc|${item.id}`,
    content: {
      instruction: 'Complete the phrase.',
      helper: 'Type the missing word. These words are often used together.',
      sentence,
      sentenceFa: persianMeaning(item),
    },
    solution: {
      acceptedAnswers: [answer],
      explanationFa: `ترکیب درست: «${item.headword}»`,
      errorCode: 'VOCAB.WRONG_COLLOCATE',
    },
  };
}

function irregularForms(item: ItemInput): ExerciseDraft | null {
  if (item.type !== 'IRREGULAR_VERB') return null;
  const past = item.payload['past'];
  const participle = item.payload['pastParticiple'];
  if (typeof past !== 'string' || typeof participle !== 'string' || !past || !participle) return null;
  return {
    format: 'irregular_verb_forms',
    level: 'RECALL',
    skill: 'GRAMMAR',
    itemIds: [item.id],
    key: `irr|${item.id}`,
    content: {
      instruction: 'Write the two missing forms.',
      helper: 'Type the past simple (V2) and the past participle (V3).',
      base: String(item.payload['base'] ?? item.headword),
      meaningFa: persianMeaning(item),
    },
    solution: { past, pastParticiple: participle },
  };
}

function wordFormation(item: ItemInput): ExerciseDraft[] {
  if (item.type !== 'WORD_FORMATION') return [];
  const forms = records(item.payload['forms']).filter((f) => typeof f['form'] === 'string' && typeof f['pos'] === 'string');
  const positions = [...new Set(forms.map((f) => f['pos'] as string))].slice(0, 3);
  return positions.map((pos) => ({
    format: 'word_formation' as const,
    level: 'RECALL' as const,
    skill: 'WORD_FORMATION' as const,
    itemIds: [item.id],
    key: `wf|${item.id}|${pos}`,
    content: {
      instruction: `Write the ${pos} form.`,
      helper: `Change the word so it works as a ${pos}. Type it, then press Check.`,
      base: String(item.payload['base'] ?? item.headword),
      targetPos: pos,
    },
    solution: {
      acceptedAnswers: forms.filter((f) => f['pos'] === pos).map((f) => String(f['form'])),
      explanationFa: `شکل ${pos}: «${forms.find((f) => f['pos'] === pos)!['form']}»`,
    },
  }));
}

function sentenceOrder(item: ItemInput): ExerciseDraft[] {
  const sentences =
    item.type === 'WORD_DISTINCTION'
      ? records(item.payload['distinctions']).flatMap((d) => (typeof d['example'] === 'string' ? [d['example'] as string] : []))
      : strings(item.payload['examples']);
  const out: ExerciseDraft[] = [];
  for (const sentence of sentences.slice(0, 3)) {
    const bare = sentence.trim().replace(/[.!?]+$/, '');
    const words = wordsOf(bare);
    if (words.length < 4 || words.length > 12) continue;
    const rng = seededRng(`${item.id}|so|${sentence}`);
    let tokens = shuffle(words, rng);
    for (let tries = 0; tries < 6 && tokens.join(' ') === words.join(' '); tries++) tokens = shuffle(words, rng);
    if (tokens.join(' ') === words.join(' ')) continue;
    out.push({
      format: 'sentence_order',
      level: 'CONTEXT',
      skill: skillForType(item.type),
      itemIds: [item.id],
      key: `so|${item.id}|${sentence}`,
      content: {
        instruction: 'Put the words in the right order.',
        helper: 'Tap the words one by one to build the sentence. Tap a word in your sentence to take it back.',
        tokens,
        translationFa: undefined,
      },
      solution: { acceptedSentences: [sentence.trim()] },
    });
  }
  return out;
}

/**
 * Dictation, made from what the item already holds: the word itself (hear it, type it) and one example
 * sentence (hear it, type it). The meaning in Persian stays beside the word so homophones are not a lottery.
 */
function listenAndType(item: ItemInput): ExerciseDraft[] {
  if (!['VOCABULARY', 'COLLOCATION', 'EXPRESSION', 'PRONUNCIATION'].includes(item.type)) return [];
  const out: ExerciseDraft[] = [];
  const headword = item.headword.trim();
  if (headword) {
    const phrase = /s/.test(headword);
    out.push({
      format: 'listen_and_type',
      level: 'RECALL',
      skill: skillForType(item.type),
      itemIds: [item.id],
      key: `lt-word|${item.id}`,
      content: {
        instruction: phrase ? 'Listen and type the phrase.' : 'Listen and type the word.',
        helper: 'Press play as often as you like, then type what you hear.',
        audioText: headword,
        meaningFa: persianMeaning(item),
      },
      solution: { acceptedAnswers: [headword], explanationFa: item.meaningFa ? `«${headword}» یعنی «${item.meaningFa}».` : undefined },
    });
  }
  const sentence = strings(item.payload['examples']).find((s) => wordsOf(s).length >= 4 && wordsOf(s).length <= 14);
  if (sentence) {
    out.push({
      format: 'listen_and_type',
      level: 'CONTEXT',
      skill: skillForType(item.type),
      itemIds: [item.id],
      key: `lt-sentence|${item.id}|${sentence}`,
      content: {
        instruction: 'Listen and type the sentence.',
        helper: 'Press play as often as you like. Capital letters and the full stop do not matter.',
        audioText: sentence,
      },
      solution: { acceptedAnswers: [sentence], explanationFa: persianMeaning(item) },
    });
  }
  return out;
}

function distinctionChoice(item: ItemInput): ExerciseDraft[] {
  if (item.type !== 'WORD_DISTINCTION') return [];
  const members = strings(item.payload['members']).slice(0, 5);
  if (members.length < 3 && members.length < 2) return [];
  const out: ExerciseDraft[] = [];
  for (const d of records(item.payload['distinctions'])) {
    const word = typeof d['word'] === 'string' ? (d['word'] as string) : '';
    const example = typeof d['example'] === 'string' ? (d['example'] as string) : '';
    if (!word || !example) continue;
    const found = findInSentence(example, word);
    if (!found) continue;
    const rng = seededRng(`${item.id}|dist|${word}`);
    const texts = shuffle(members.includes(word) ? members : [...members, word].slice(0, 5), rng);
    if (texts.length < 3) continue; // two options is a coin flip
    const options = texts.map((text, i) => ({ id: OPTION_IDS[i]!, text }));
    const correctOptionId = options.find((o) => o.text === word)!.id;
    out.push({
      format: 'multiple_choice',
      level: 'CONTEXT',
      skill: 'GRAMMAR',
      itemIds: [item.id],
      key: `dist|${item.id}|${word}`,
      content: {
        instruction: 'Choose the word that fits the gap.',
        helper: 'Think about how each word is used, then tap the best one.',
        prompt: blankOut(example, found),
        options,
      },
      solution: {
        correctOptionId,
        distractorErrors: Object.fromEntries(options.filter((o) => o.id !== correctOptionId).map((o) => [o.id, 'VOCAB.CONFUSABLE'])),
        explanationFa: typeof d['usageFa'] === 'string' && d['usageFa'] ? `${word}: ${d['usageFa']}` : undefined,
      },
    });
  }
  return out;
}

/**
 * Every exercise that can be made from this item with plain code, no AI. Deterministic: the same
 * item and library always give the same drafts, so saving them twice never duplicates anything.
 * `others` supply the wrong options for multiple choice.
 */
export function generateTemplates(item: ItemInput, others: ItemInput[]): ExerciseDraft[] {
  const peers = others.filter((o) => o.id !== item.id);
  return [
    flashcard(item),
    meaningChoice(item, peers),
    wordChoice(item, peers),
    wordRecall(item),
    ...fillBlankFromExamples(item),
    collocationCompletion(item),
    irregularForms(item),
    ...wordFormation(item),
    ...sentenceOrder(item),
    ...listenAndType(item),
    ...distinctionChoice(item),
  ].filter((d): d is ExerciseDraft => d !== null);
}

/** A matching exercise over 3 to 5 items that have a Persian meaning. */
export function generateMatching(items: ItemInput[]): ExerciseDraft | null {
  const usable = items.filter((i) => i.meaningFa?.trim()).slice(0, 5);
  if (usable.length < 3) return null;
  const sorted = [...usable].sort((a, b) => a.id.localeCompare(b.id));
  const rng = seededRng(`match|${sorted.map((i) => i.id).join('|')}`);
  const left = usable.map((item, i) => ({ id: `l${i + 1}`, text: item.headword }));
  const rightSource = usable.map((item, i) => ({ id: `r${i + 1}`, text: item.meaningFa!.trim(), rtl: true as const }));
  const right = shuffle(rightSource, rng);
  return {
    format: 'matching',
    level: 'RECOGNITION',
    skill: skillForType(usable[0]!.type),
    itemIds: usable.map((i) => i.id),
    key: `match|${sorted.map((i) => i.id).join('|')}`,
    content: {
      instruction: 'Match each word with its meaning.',
      helper: 'Tap a word on the left, then tap its meaning on the right. Press Check when all are matched.',
      left,
      right,
    },
    solution: {
      pairs: Object.fromEntries(usable.map((_, i) => [`l${i + 1}`, `r${i + 1}`])),
      itemByLeft: Object.fromEntries(usable.map((item, i) => [`l${i + 1}`, item.id])),
    },
  };
}
