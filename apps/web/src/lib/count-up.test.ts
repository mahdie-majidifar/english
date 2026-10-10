import { describe, expect, it } from 'vitest';
import { countUpValue, easeOutCubic } from './count-up';

describe('easeOutCubic', () => {
  it('runs from 0 to 1 and never leaves that range', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(5)).toBe(1);
  });

  it('is quick at the start and slow at the end', () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    expect(easeOutCubic(0.5) - easeOutCubic(0.25)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.75));
  });
});

describe('countUpValue', () => {
  it('starts at zero and ends exactly on the target', () => {
    expect(countUpValue(120, 0, 800)).toBe(0);
    expect(countUpValue(120, 800, 800)).toBe(120);
    expect(countUpValue(120, 5000, 800)).toBe(120);
  });

  it('only ever shows whole numbers, rising all the way', () => {
    let last = -1;
    for (let t = 0; t <= 800; t += 40) {
      const v = countUpValue(137, t, 800);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('shows the target at once when there is no time to count', () => {
    expect(countUpValue(50, 0, 0)).toBe(50);
  });

  it('handles zero', () => {
    expect(countUpValue(0, 300, 800)).toBe(0);
  });
});
