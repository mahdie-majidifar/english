/**
 * "Today" is always the learner's local calendar day, never UTC.
 * Streaks, daily sessions and SRS "first review of the day" all depend on this.
 */

/** Returns the local calendar date as `YYYY-MM-DD` in the given IANA timezone. */
export function toLocalDate(instant: Date, timeZone: string): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

const MS_PER_DAY = 86_400_000;

function parseLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid local date: ${localDate}`);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to) - parseLocalDate(from)) / MS_PER_DAY);
}

/** Adds (or subtracts) whole days to a `YYYY-MM-DD` date. */
export function addDays(localDate: string, days: number): string {
  return new Date(parseLocalDate(localDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
