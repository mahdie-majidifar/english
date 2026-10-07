import { describe, expect, it } from 'vitest';
import { ParsedMaterialSchema, draftItemPayload, draftItemProblem, emptyDraftItem } from './teacher.js';
import { parseItemPayload } from './content.js';

describe('draftItemProblem', () => {
  it('accepts complete items of simple types', () => {
    expect(draftItemProblem(emptyDraftItem('VOCABULARY', 'negotiate'))).toBeNull();
    expect(draftItemProblem(emptyDraftItem('GRAMMAR', 'Reported speech'))).toBeNull();
  });

  it('explains what an incomplete item needs', () => {
    expect(draftItemProblem(emptyDraftItem('IRREGULAR_VERB', 'wear'))).toMatch(/past simple/);
    expect(draftItemProblem(emptyDraftItem('WORD_FORMATION', 'fail'))).toMatch(/related form/);
    expect(draftItemProblem(emptyDraftItem('WORD_DISTINCTION', 'fit / suit'))).toMatch(/two words/);
    expect(draftItemProblem(emptyDraftItem('VOCABULARY', '  '))).toBe('Missing word');
  });

  it('is satisfied once the missing details are filled in', () => {
    const verb = { ...emptyDraftItem('IRREGULAR_VERB', 'wear'), past: 'wore', pastParticiple: 'worn' };
    expect(draftItemProblem(verb)).toBeNull();
    const formation = { ...emptyDraftItem('WORD_FORMATION', 'fail'), forms: [{ form: 'failure', pos: 'noun' as const }] };
    expect(draftItemProblem(formation)).toBeNull();
  });
});

describe('draftItemPayload', () => {
  it('produces a payload that passes the shared item contract', () => {
    const draft = { ...emptyDraftItem('VOCABULARY', 'negotiate'), partOfSpeech: 'verb' as const, examples: [' We negotiated. '] };
    const payload = draftItemPayload(draft);
    const parsed = parseItemPayload('VOCABULARY', payload);
    expect(parsed.success && parsed.data).toMatchObject({ partOfSpeech: 'verb', examples: ['We negotiated.'] });
  });

  it('uses the headword as the base of irregular verbs and word families', () => {
    expect(draftItemPayload({ ...emptyDraftItem('IRREGULAR_VERB', ' wear '), past: 'wore', pastParticiple: 'worn' })).toMatchObject({
      base: 'wear',
    });
  });
});

describe('ParsedMaterialSchema', () => {
  it('rejects an AI answer with the wrong shape', () => {
    expect(ParsedMaterialSchema.safeParse({ summary: 'x', items: 'not a list', exercises: [] }).success).toBe(false);
    expect(ParsedMaterialSchema.safeParse({ nonsense: true }).success).toBe(false);
  });

  it('accepts a well-formed answer', () => {
    const parsed = ParsedMaterialSchema.safeParse({
      summary: 'Business vocabulary.',
      items: [emptyDraftItem('VOCABULARY', 'negotiate')],
      exercises: [{ originalText: 'Fill the gap.', skill: 'GRAMMAR', topic: null }],
    });
    expect(parsed.success).toBe(true);
  });
});
