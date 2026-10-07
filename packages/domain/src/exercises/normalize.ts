/**
 * Comparing what a learner typed with the accepted answer. Forgiving about things that are not
 * mistakes (case, spacing, punctuation, "didn't" vs "did not") and strict about things that are.
 */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'],
  [/'ll\b/g, ' will'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'m\b/g, ' am'],
];

export function normalizeAnswer(input: string): string {
  let s = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'");
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  return s
    .replace(/\bcan not\b/g, 'cannot')
    .replace(/[.,;:!?"“”()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Number of single-character edits between two strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Endings that change a word's grammar. Getting one wrong is a grammar mistake, never a typo. */
const INFLECTION_ENDINGS = new Set(['', 's', 'es', 'd', 'ed', 'ing', 'ly', 'er', 'est', 'ion', 'ment', 'ity']);

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** "negotiate" vs "negotiated", or "worked" vs "works": same stem, different grammatical ending. */
function isWrongForm(typed: string, target: string): boolean {
  const cp = commonPrefixLength(typed, target);
  return INFLECTION_ENDINGS.has(typed.slice(cp)) && INFLECTION_ENDINGS.has(target.slice(cp));
}

export interface AnswerMatch {
  verdict: 'correct' | 'almost' | 'wrong';
  /** The accepted answer that matched (as written in the solution). */
  matched?: string;
}

/**
 * Exact match after normalising = correct. A single-word answer that is one slip away (a missing or
 * swapped letter) = almost. Sentences never get typo tolerance: one letter can be a grammar error.
 */
export function compareAnswer(input: string, accepted: readonly string[]): AnswerMatch {
  const typed = normalizeAnswer(input);
  if (!typed) return { verdict: 'wrong' };

  for (const candidate of accepted) {
    if (normalizeAnswer(candidate) === typed) return { verdict: 'correct', matched: candidate };
  }

  if (!typed.includes(' ')) {
    for (const candidate of accepted) {
      const target = normalizeAnswer(candidate);
      if (target.includes(' ') || target.length < 5) continue;
      if (isWrongForm(typed, target)) continue;
      const allowed = target.length >= 10 ? 2 : 1;
      if (editDistance(typed, target) <= allowed) return { verdict: 'almost', matched: candidate };
    }
  }
  return { verdict: 'wrong' };
}

/** "learnt/learned" in a solution means either form is right. */
export function splitAlternatives(answer: string): string[] {
  return answer
    .split('/')
    .map((a) => a.trim())
    .filter(Boolean);
}
