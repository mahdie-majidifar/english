import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isValidTimeZone, toLocalDate } from './time.js';

describe('toLocalDate', () => {
  it('uses the learner timezone, not UTC', () => {
    // 21:30 UTC on Jan 1st is already Jan 2nd (01:00) in Tehran (UTC+3:30, no DST in 2026).
    const instant = new Date('2026-01-01T21:30:00Z');
    expect(toLocalDate(instant, 'UTC')).toBe('2026-01-01');
    expect(toLocalDate(instant, 'Asia/Tehran')).toBe('2026-01-02');
  });

  it('does not break a streak for a 1am study session', () => {
    const lateNight = new Date('2026-03-10T21:45:00Z'); // 01:15 Mar 11 in Tehran
    expect(toLocalDate(lateNight, 'Asia/Tehran')).toBe('2026-03-11');
  });
});

describe('daysBetween / addDays', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(daysBetween('2026-03-02', '2026-02-27')).toBe(-3);
    expect(daysBetween('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('Asia/Tehran')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
