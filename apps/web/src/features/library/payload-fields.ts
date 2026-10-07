import type { ItemType } from '@coach/contracts';

/** Raw text of each form field. Everything is a string until `buildPayload` shapes it for the API. */
export type Draft = Record<string, string>;

export interface FieldDef {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select';
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  rtl?: boolean;
  rows?: number;
}

const POS = [
  { value: '', label: 'Not set' },
  { value: 'noun', label: 'Noun' },
  { value: 'verb', label: 'Verb' },
  { value: 'adjective', label: 'Adjective' },
  { value: 'adverb', label: 'Adverb' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'other', label: 'Other' },
];

const EXAMPLES: FieldDef = {
  key: 'examples',
  label: 'Example sentences',
  kind: 'textarea',
  placeholder: 'We negotiated a discount.',
  hint: 'One sentence per line.',
};

/** Type-specific inputs. Headword and meanings are shared and live outside this table. */
export const PAYLOAD_FIELDS: Record<ItemType, FieldDef[]> = {
  VOCABULARY: [
    { key: 'partOfSpeech', label: 'Part of speech', kind: 'select', options: POS },
    { key: 'ipa', label: 'Pronunciation (IPA)', kind: 'text', placeholder: '/nɪˈɡoʊʃieɪt/' },
    EXAMPLES,
    {
      key: 'wordFamily',
      label: 'Word family',
      kind: 'textarea',
      placeholder: 'negotiation | noun\nnegotiator | noun',
      hint: 'One per line: word | part of speech.',
      rows: 2,
    },
  ],
  COLLOCATION: [
    { key: 'keyword', label: 'Key word', kind: 'text', placeholder: 'negotiate', hint: 'The word this phrase is built around.' },
    EXAMPLES,
  ],
  GRAMMAR: [
    { key: 'structure', label: 'Structure', kind: 'text', placeholder: 'say (that) + clause, with backshift' },
    EXAMPLES,
    { key: 'notesFa', label: 'Notes (Persian)', kind: 'textarea', rtl: true, placeholder: 'توضیح قاعده…' },
  ],
  EXPRESSION: [
    {
      key: 'register',
      label: 'Register',
      kind: 'select',
      options: [
        { value: '', label: 'Not set' },
        { value: 'neutral', label: 'Neutral' },
        { value: 'formal', label: 'Formal' },
        { value: 'informal', label: 'Informal' },
        { value: 'slang', label: 'Slang' },
      ],
    },
    EXAMPLES,
  ],
  WORD_FORMATION: [
    {
      key: 'forms',
      label: 'Related forms',
      kind: 'textarea',
      placeholder: 'failure | noun\nfail | verb',
      hint: 'One per line: form | noun, verb, adjective or adverb. The headword is the base word.',
      rows: 4,
    },
  ],
  IRREGULAR_VERB: [
    { key: 'past', label: 'Past simple (V2)', kind: 'text', placeholder: 'wore' },
    { key: 'pastParticiple', label: 'Past participle (V3)', kind: 'text', placeholder: 'worn' },
  ],
  WORD_DISTINCTION: [
    {
      key: 'members',
      label: 'Words being compared',
      kind: 'text',
      placeholder: 'fit, suit, match',
      hint: 'Separate with commas. At least two.',
    },
    {
      key: 'distinctions',
      label: 'How they differ',
      kind: 'textarea',
      placeholder: 'fit | اندازه بودن | These shoes fit me.\nsuit | به کسی آمدن | Blue suits you.',
      hint: 'One per line: word | Persian explanation | example sentence.',
      rows: 4,
    },
  ],
  SENTENCE_PATTERN: [
    { key: 'pattern', label: 'Pattern', kind: 'text', placeholder: 'I wish I had + past participle' },
    EXAMPLES,
  ],
  PRONUNCIATION: [
    { key: 'ipa', label: 'IPA', kind: 'text', placeholder: '/ˈkɒnsəvətɪv/' },
    { key: 'tipFa', label: 'Tip (Persian)', kind: 'textarea', rtl: true, placeholder: 'نکته‌ی تلفظ…' },
  ],
};

export function emptyDraft(type: ItemType): Draft {
  return Object.fromEntries(PAYLOAD_FIELDS[type].map((f) => [f.key, '']));
}

const lines = (text: string | undefined): string[] =>
  (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const cells = (line: string): string[] => line.split('|').map((c) => c.trim());

const optional = (value: string | undefined): string | undefined => {
  const v = value?.trim();
  return v ? v : undefined;
};

/** Shapes the form text into the payload the API validates. `headword` fills "base" where it applies. */
export function buildPayload(type: ItemType, draft: Draft, headword: string): Record<string, unknown> {
  const d = (key: string) => draft[key] ?? '';
  switch (type) {
    case 'VOCABULARY':
      return {
        partOfSpeech: optional(d('partOfSpeech')),
        ipa: optional(d('ipa')),
        examples: lines(d('examples')),
        wordFamily: lines(d('wordFamily')).map((l) => {
          const [form = '', pos = ''] = cells(l);
          return { form, pos };
        }),
      };
    case 'COLLOCATION':
      return { keyword: optional(d('keyword')), examples: lines(d('examples')) };
    case 'GRAMMAR':
      return {
        structure: optional(d('structure')),
        examples: lines(d('examples')),
        notesFa: optional(d('notesFa')),
      };
    case 'EXPRESSION':
      return { register: optional(d('register')), examples: lines(d('examples')) };
    case 'WORD_FORMATION':
      return {
        base: headword.trim(),
        forms: lines(d('forms')).map((l) => {
          const [form = '', pos = ''] = cells(l);
          return { form, pos: pos.toLowerCase() };
        }),
      };
    case 'IRREGULAR_VERB':
      return { base: headword.trim(), past: d('past').trim(), pastParticiple: d('pastParticiple').trim() };
    case 'WORD_DISTINCTION':
      return {
        members: d('members')
          .split(/[,\n]/)
          .map((m) => m.trim())
          .filter(Boolean),
        distinctions: lines(d('distinctions')).map((l) => {
          const [word = '', usageFa = '', example = ''] = cells(l);
          return { word, usageFa, example };
        }),
      };
    case 'SENTENCE_PATTERN':
      return { pattern: d('pattern').trim(), examples: lines(d('examples')) };
    case 'PRONUNCIATION':
      return { ipa: optional(d('ipa')), tipFa: optional(d('tipFa')) };
  }
}

/**
 * Friendly, instant checks before anything is sent. The server validates again (it is the
 * authority); these only exist so the learner sees a clear message next to the right field.
 * Keys are field keys, plus "headword".
 */
export function validateDraft(type: ItemType, headword: string, draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  const d = (key: string) => (draft[key] ?? '').trim();
  if (!headword.trim()) errors['headword'] = 'This is required.';

  switch (type) {
    case 'IRREGULAR_VERB':
      if (!d('past')) errors['past'] = 'Enter the past simple form.';
      if (!d('pastParticiple')) errors['pastParticiple'] = 'Enter the past participle.';
      break;
    case 'WORD_FORMATION': {
      const forms = lines(d('forms'));
      if (forms.length === 0) errors['forms'] = 'Add at least one related form, like “failure | noun”.';
      else if (
        forms.some((l) => !['noun', 'verb', 'adjective', 'adverb'].includes((cells(l)[1] ?? '').toLowerCase()))
      )
        errors['forms'] = 'Each line needs a part of speech: noun, verb, adjective or adverb.';
      break;
    }
    case 'WORD_DISTINCTION':
      if (d('members').split(/[,\n]/).filter((m) => m.trim()).length < 2)
        errors['members'] = 'List at least two words, separated by commas.';
      break;
    case 'SENTENCE_PATTERN':
      if (!d('pattern')) errors['pattern'] = 'Write the pattern itself.';
      break;
    default:
      break;
  }
  return errors;
}

type Json = Record<string, unknown>;
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const rows = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/** Inverse of `buildPayload`: fills the edit form from a stored payload. */
export function draftFromPayload(type: ItemType, payload: Json): Draft {
  const draft = emptyDraft(type);
  switch (type) {
    case 'VOCABULARY':
      draft['partOfSpeech'] = text(payload['partOfSpeech']);
      draft['ipa'] = text(payload['ipa']);
      draft['examples'] = strings(payload['examples']).join('\n');
      draft['wordFamily'] = rows(payload['wordFamily'])
        .map((r) => `${text(r['form'])} | ${text(r['pos'])}`)
        .join('\n');
      break;
    case 'COLLOCATION':
      draft['keyword'] = text(payload['keyword']);
      draft['examples'] = strings(payload['examples']).join('\n');
      break;
    case 'GRAMMAR':
      draft['structure'] = text(payload['structure']);
      draft['examples'] = strings(payload['examples']).join('\n');
      draft['notesFa'] = text(payload['notesFa']);
      break;
    case 'EXPRESSION':
      draft['register'] = text(payload['register']);
      draft['examples'] = strings(payload['examples']).join('\n');
      break;
    case 'WORD_FORMATION':
      draft['forms'] = rows(payload['forms'])
        .map((r) => `${text(r['form'])} | ${text(r['pos'])}`)
        .join('\n');
      break;
    case 'IRREGULAR_VERB':
      draft['past'] = text(payload['past']);
      draft['pastParticiple'] = text(payload['pastParticiple']);
      break;
    case 'WORD_DISTINCTION':
      draft['members'] = strings(payload['members']).join(', ');
      draft['distinctions'] = rows(payload['distinctions'])
        .map((r) => `${text(r['word'])} | ${text(r['usageFa'])} | ${text(r['example'])}`)
        .join('\n');
      break;
    case 'SENTENCE_PATTERN':
      draft['pattern'] = text(payload['pattern']);
      draft['examples'] = strings(payload['examples']).join('\n');
      break;
    case 'PRONUNCIATION':
      draft['ipa'] = text(payload['ipa']);
      draft['tipFa'] = text(payload['tipFa']);
      break;
  }
  return draft;
}
