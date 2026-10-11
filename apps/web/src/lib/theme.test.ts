import { describe, expect, it } from 'vitest';
import { parseTheme } from './theme';

describe('parseTheme', () => {
  it('accepts light and dark', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });

  it('treats anything else as "follow the device"', () => {
    expect(parseTheme(undefined)).toBe('system');
    expect(parseTheme(null)).toBe('system');
    expect(parseTheme('system')).toBe('system');
    expect(parseTheme('<script>')).toBe('system');
  });
});
