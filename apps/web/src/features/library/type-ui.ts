import type { ItemType } from '@coach/contracts';

/** What the learner sees when adding each kind of item. */
export const TYPE_UI: Record<
  ItemType,
  { placeholder: string; description: string; headwordLabel: string }
> = {
  VOCABULARY: { placeholder: 'negotiate', description: 'A single word and its meaning.', headwordLabel: 'Word' },
  COLLOCATION: {
    placeholder: 'negotiate a discount',
    description: 'Words that naturally go together.',
    headwordLabel: 'Collocation',
  },
  GRAMMAR: { placeholder: 'Reported speech', description: 'A rule or structure.', headwordLabel: 'Grammar point' },
  EXPRESSION: { placeholder: "can't resist", description: 'A fixed phrase or idiom.', headwordLabel: 'Expression' },
  WORD_FORMATION: {
    placeholder: 'fail',
    description: 'A base word and its noun, verb and adjective forms.',
    headwordLabel: 'Base word',
  },
  IRREGULAR_VERB: {
    placeholder: 'wear',
    description: 'A verb with its past forms (V1, V2, V3).',
    headwordLabel: 'Base form (V1)',
  },
  WORD_DISTINCTION: {
    placeholder: 'fit / suit / match',
    description: 'Similar words and when to use each.',
    headwordLabel: 'Words being compared',
  },
  SENTENCE_PATTERN: {
    placeholder: 'I wish I had + past participle',
    description: 'A reusable sentence frame.',
    headwordLabel: 'Pattern name',
  },
  PRONUNCIATION: {
    placeholder: 'conservative',
    description: 'A word with a tricky sound.',
    headwordLabel: 'Word',
  },
};

/** Order used by tabs and the type picker. */
export const TYPE_ORDER: ItemType[] = [
  'VOCABULARY',
  'COLLOCATION',
  'GRAMMAR',
  'EXPRESSION',
  'WORD_FORMATION',
  'IRREGULAR_VERB',
  'WORD_DISTINCTION',
  'SENTENCE_PATTERN',
  'PRONUNCIATION',
];
