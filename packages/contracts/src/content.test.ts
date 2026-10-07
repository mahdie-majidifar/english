import { describe, expect, it } from 'vitest';
import { CreateItemSchema, UpdateItemSchema, parseItemPayload } from './content.js';
import { CreateBookSchema, CreateLessonSchema } from './catalog.js';
import { UpdateProfileSchema } from './profile.js';

describe('item payloads', () => {
  it('accepts a minimal vocabulary payload and fills defaults', () => {
    const result = parseItemPayload('VOCABULARY', {});
    expect(result.success).toBe(true);
    expect(result.success && result.data).toMatchObject({ examples: [], wordFamily: [] });
  });

  it('requires all three forms of an irregular verb', () => {
    const result = parseItemPayload('IRREGULAR_VERB', { base: 'wear', past: 'wore' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.path).toEqual(['pastParticiple']);
  });

  it('needs at least two members for a word distinction', () => {
    expect(parseItemPayload('WORD_DISTINCTION', { members: ['fit'] }).success).toBe(false);
    expect(parseItemPayload('WORD_DISTINCTION', { members: ['fit', 'suit'] }).success).toBe(true);
  });
});

describe('CreateItemSchema', () => {
  it('validates the payload against the chosen type and reports a nested path', () => {
    const result = CreateItemSchema.safeParse({
      type: 'IRREGULAR_VERB',
      headword: 'wear',
      payload: { base: 'wear', past: 'wore' },
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.map((i) => i.path.join('.'))).toContain('payload.pastParticiple');
  });

  it('turns blank meanings into null and trims the headword', () => {
    const result = CreateItemSchema.parse({ type: 'VOCABULARY', headword: '  negotiate ', meaningEn: '  ' });
    expect(result.headword).toBe('negotiate');
    expect(result.meaningEn).toBeNull();
  });

  it('rejects an empty headword and unknown types', () => {
    expect(CreateItemSchema.safeParse({ type: 'VOCABULARY', headword: ' ' }).success).toBe(false);
    expect(CreateItemSchema.safeParse({ type: 'NOPE', headword: 'x' }).success).toBe(false);
  });
});

describe('UpdateItemSchema', () => {
  it('does not allow changing the type', () => {
    expect(UpdateItemSchema.safeParse({ type: 'GRAMMAR' }).success).toBe(false);
    expect(UpdateItemSchema.safeParse({ headword: 'x' }).success).toBe(true);
  });
});

describe('catalog and profile schemas', () => {
  it('defaults the series and requires a title', () => {
    expect(CreateBookSchema.parse({ title: 'American English File 3' }).series).toBe('American English File');
    expect(CreateBookSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('limits lesson codes to 8 characters', () => {
    expect(CreateLessonSchema.safeParse({ code: '8B', title: 'Business' }).success).toBe(true);
    expect(CreateLessonSchema.safeParse({ code: '123456789', title: 'x' }).success).toBe(false);
  });

  it('rejects unknown profile fields and out-of-range goals', () => {
    expect(UpdateProfileSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ dailyGoalMinutes: 3 }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ dailyGoalMinutes: 15 }).success).toBe(true);
  });
});
