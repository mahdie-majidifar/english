import { describe, expect, it } from 'vitest';
import { ITEM_TYPES, parseItemPayload } from '@coach/contracts';
import { buildPayload, draftFromPayload, emptyDraft, validateDraft } from './payload-fields';

describe('buildPayload', () => {
  it('turns multi-line text into arrays and drops blanks', () => {
    const payload = buildPayload(
      'VOCABULARY',
      { ...emptyDraft('VOCABULARY'), partOfSpeech: 'verb', examples: ' We negotiated.\n\n Let us negotiate. ', wordFamily: 'negotiation | noun' },
      'negotiate',
    );
    expect(payload).toEqual({
      partOfSpeech: 'verb',
      ipa: undefined,
      examples: ['We negotiated.', 'Let us negotiate.'],
      wordFamily: [{ form: 'negotiation', pos: 'noun' }],
    });
  });

  it('uses the headword as the base for irregular verbs and word families', () => {
    expect(buildPayload('IRREGULAR_VERB', { past: 'wore', pastParticiple: 'worn' }, ' wear ')).toEqual({
      base: 'wear',
      past: 'wore',
      pastParticiple: 'worn',
    });
    expect(buildPayload('WORD_FORMATION', { forms: 'failure | Noun' }, 'fail')).toEqual({
      base: 'fail',
      forms: [{ form: 'failure', pos: 'noun' }],
    });
  });

  it('parses word distinctions', () => {
    const payload = buildPayload(
      'WORD_DISTINCTION',
      { members: 'fit, suit , match', distinctions: 'fit | اندازه بودن | These shoes fit me.' },
      'fit / suit / match',
    );
    expect(payload['members']).toEqual(['fit', 'suit', 'match']);
    expect(payload['distinctions']).toEqual([{ word: 'fit', usageFa: 'اندازه بودن', example: 'These shoes fit me.' }]);
  });

  it('produces payloads that pass the shared contract for every type', () => {
    const minimal: Record<string, [Record<string, string>, string]> = {
      VOCABULARY: [{}, 'negotiate'],
      COLLOCATION: [{}, 'negotiate a discount'],
      GRAMMAR: [{}, 'Reported speech'],
      EXPRESSION: [{}, "can't resist"],
      WORD_FORMATION: [{ forms: 'failure | noun' }, 'fail'],
      IRREGULAR_VERB: [{ past: 'wore', pastParticiple: 'worn' }, 'wear'],
      WORD_DISTINCTION: [{ members: 'fit, suit' }, 'fit / suit'],
      SENTENCE_PATTERN: [{ pattern: 'I wish I had + V3' }, 'wish + past perfect'],
      PRONUNCIATION: [{}, 'conservative'],
    };
    for (const type of ITEM_TYPES) {
      const [draft, headword] = minimal[type]!;
      const payload = buildPayload(type, { ...emptyDraft(type), ...draft }, headword);
      const result = parseItemPayload(type, payload);
      expect(result.success, `${type}: ${!result.success && result.error.message}`).toBe(true);
    }
  });
});

describe('validateDraft', () => {
  it('asks for the headword and type-specific required fields with friendly messages', () => {
    expect(validateDraft('VOCABULARY', '  ', emptyDraft('VOCABULARY'))).toEqual({ headword: 'This is required.' });
    const verb = validateDraft('IRREGULAR_VERB', 'wear', emptyDraft('IRREGULAR_VERB'));
    expect(Object.keys(verb).sort()).toEqual(['past', 'pastParticiple']);
    expect(validateDraft('WORD_DISTINCTION', 'fit', { members: 'fit', distinctions: '' })['members']).toMatch(/two/);
  });

  it('flags word-formation lines without a valid part of speech', () => {
    expect(validateDraft('WORD_FORMATION', 'fail', { forms: 'failure' })['forms']).toMatch(/part of speech/);
    expect(validateDraft('WORD_FORMATION', 'fail', { forms: 'failure | noun' })).toEqual({});
  });

  it('accepts a complete minimal draft', () => {
    expect(validateDraft('VOCABULARY', 'negotiate', emptyDraft('VOCABULARY'))).toEqual({});
  });
});

describe('draftFromPayload', () => {
  it('round-trips through buildPayload for every type', () => {
    const full: Record<string, Record<string, unknown>> = {
      VOCABULARY: { partOfSpeech: 'verb', ipa: '/x/', examples: ['a', 'b'], wordFamily: [{ form: 'negotiation', pos: 'noun' }] },
      COLLOCATION: { keyword: 'negotiate', examples: ['a'] },
      GRAMMAR: { structure: 's', examples: ['a'], notesFa: 'ب' },
      EXPRESSION: { register: 'formal', examples: ['a'] },
      WORD_FORMATION: { base: 'fail', forms: [{ form: 'failure', pos: 'noun' }] },
      IRREGULAR_VERB: { base: 'wear', past: 'wore', pastParticiple: 'worn' },
      WORD_DISTINCTION: { members: ['fit', 'suit'], distinctions: [{ word: 'fit', usageFa: 'الف', example: 'e' }] },
      SENTENCE_PATTERN: { pattern: 'p', examples: ['a'] },
      PRONUNCIATION: { ipa: '/x/', tipFa: 'ب' },
    };
    for (const type of ITEM_TYPES) {
      const stored = full[type]!;
      const headword = typeof stored['base'] === 'string' ? stored['base'] : 'headword';
      const rebuilt = buildPayload(type, draftFromPayload(type, stored), headword);
      // JSON drops undefined keys, like the real request does.
      expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(stored);
    }
  });
});
