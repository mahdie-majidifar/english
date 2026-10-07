import type { ErrorTypeCode, ExerciseFormat } from '@coach/contracts';
import { daysBetween } from '../time.js';

export type MistakeStatus = 'ACTIVE' | 'IMPROVING' | 'RESOLVED';

/** How serious one kind of error is (1 to 3). Grammar and verb forms cost more than a slip of spelling. */
export function severityOf(code: string): 1 | 2 | 3 {
  if (code.startsWith('SPELLING.') || code === 'OTHER.OTHER') return 1;
  if (code.startsWith('GRAMMAR.') || code.startsWith('VERB.') || code.startsWith('L1.')) return 3;
  return 2;
}

/**
 * How much a mistake deserves attention: serious, repeated, recent mistakes first.
 *   severity x log2(1 + times in the last 30 days) x decay (half-life 14 days)
 */
export function mistakePriority(input: { severity: number; occurrencesLast30Days: number; daysSinceLast: number }): number {
  const decay = Math.pow(0.5, Math.max(0, input.daysSinceLast) / 14);
  return input.severity * Math.log2(1 + input.occurrencesLast30Days) * decay;
}

/** A stored priority fades with time since the mistake was last made (half-life 14 days). */
export const decayPriority = (storedPriority: number, daysSinceLast: number): number =>
  storedPriority * Math.pow(0.5, Math.max(0, daysSinceLast) / 14);

/** Three or more times in two weeks: shown as a "repeated" mistake. */
export const isRepeated = (occurrencesLast14Days: number): boolean => occurrencesLast14Days >= 3;

/** Priority above this makes the item "weak" for planning. */
export const SERIOUS_PRIORITY = 2.5;

export const mistakeSignature = (itemId: string, code: string): string => `${itemId}:${code}`;

export interface MistakeProgress {
  status: MistakeStatus;
  correctDays: number;
  lastCorrectDate: string | null;
}

/** A new error brings an old mistake back to ACTIVE and restarts the count of correct days. */
export function afterError(): MistakeProgress {
  return { status: 'ACTIVE', correctDays: 0, lastCorrectDate: null };
}

/**
 * A right answer on a new day counts toward fixing the mistake: one day = improving, three
 * different days = resolved. Several right answers on the same day count once.
 */
export function afterCorrect(current: MistakeProgress, localDate: string): MistakeProgress {
  if (current.status === 'RESOLVED' || current.lastCorrectDate === localDate) return current;
  const correctDays = current.correctDays + 1;
  return { status: correctDays >= 3 ? 'RESOLVED' : 'IMPROVING', correctDays, lastCorrectDate: localDate };
}

export const daysSince = (lastSeenLocalDate: string, todayLocalDate: string): number =>
  Math.max(0, daysBetween(lastSeenLocalDate, todayLocalDate));

type Json = Record<string, unknown>;

/** What the learner actually answered, in words, for the mistake history. */
export function describeResponse(format: ExerciseFormat, content: unknown, response: unknown): string {
  const r = (response ?? {}) as Json;
  const c = (content ?? {}) as Json;
  switch (format) {
    case 'multiple_choice': {
      const options = (c['options'] ?? []) as { id: string; text: string }[];
      return options.find((o) => o.id === r['optionId'])?.text ?? '';
    }
    case 'matching': {
      const left = (c['left'] ?? []) as { id: string; text: string }[];
      const right = (c['right'] ?? []) as { id: string; text: string }[];
      const pairs = (r['pairs'] ?? {}) as Record<string, string>;
      return left.map((l) => `${l.text} → ${right.find((x) => x.id === pairs[l.id])?.text ?? '?'}`).join('; ');
    }
    case 'irregular_verb_forms':
      return `${r['past'] ?? ''} / ${r['pastParticiple'] ?? ''}`;
    case 'sentence_order': {
      const tokens = (c['tokens'] ?? []) as string[];
      return ((r['order'] ?? []) as number[]).map((i) => tokens[i] ?? '').join(' ');
    }
    case 'flashcard':
      return 'Marked as not known';
    default:
      return String(r['answer'] ?? '');
  }
}

export type { ErrorTypeCode };
