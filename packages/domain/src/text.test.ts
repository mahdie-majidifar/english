import { describe, expect, it } from 'vitest';
import { isPlaceholderLessonTitle, normalizeKey, parseStructureText } from './text.js';

describe('normalizeKey', () => {
  it('treats casing, spacing and trailing punctuation as the same word', () => {
    expect(normalizeKey('  Negotiate ')).toBe('negotiate');
    expect(normalizeKey('negotiate.')).toBe('negotiate');
    expect(normalizeKey('Disposable   income')).toBe('disposable income');
  });

  it('unifies apostrophes and slashes', () => {
    expect(normalizeKey('can’t resist')).toBe("can't resist");
    expect(normalizeKey('fit / suit /  match')).toBe('fit/suit/match');
  });
});

describe('parseStructureText', () => {
  it('parses lessons and derives units', () => {
    const result = parseStructureText(['8A Shopping', '8B - Business', '9a: Weather'].join('\n'));
    expect(result.lessons).toEqual([
      { unitNumber: 8, code: '8A', title: 'Shopping' },
      { unitNumber: 8, code: '8B', title: 'Business' },
      { unitNumber: 9, code: '9A', title: 'Weather' },
    ]);
    expect(result.units.map((u) => u.number)).toEqual([8, 9]);
    expect(result.rejected).toEqual([]);
  });

  it('reads unit title lines', () => {
    const result = parseStructureText('Unit 8: Money\n8A Shopping\n9 Weather and climate');
    expect(result.units).toEqual([
      { number: 8, title: 'Money' },
      { number: 9, title: 'Weather and climate' },
    ]);
    expect(result.lessons).toHaveLength(1);
  });

  it('collects lines it cannot understand and ignores blanks', () => {
    const result = parseStructureText('\n  \nIntroduction\n1A Hello');
    expect(result.rejected).toEqual(['Introduction']);
    expect(result.lessons).toHaveLength(1);
  });

  it('handles Windows line endings', () => {
    expect(parseStructureText('1A One\r\n1B Two\r\n').lessons).toHaveLength(2);
  });
});

describe('isPlaceholderLessonTitle', () => {
  it('recognises the neutral names templates use', () => {
    for (const t of ['Lesson A', 'Lesson C', 'Unit 1', 'Unit 60', ' Lesson B ']) expect(isPlaceholderLessonTitle(t)).toBe(true);
  });

  it('never treats a real title as a placeholder', () => {
    for (const t of ['Business', 'Unit of measure', 'Lesson plans', 'Lesson', 'Unit', 'Unit one', 'Shopping']) {
      expect(isPlaceholderLessonTitle(t)).toBe(false);
    }
  });
});
