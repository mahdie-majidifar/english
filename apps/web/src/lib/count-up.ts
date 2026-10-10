/** Starts fast and settles gently, so a number "lands" instead of just appearing. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/** The number to show `elapsedMs` into a count-up from 0 to `target` that lasts `durationMs`. */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  return Math.round(target * easeOutCubic(elapsedMs / durationMs));
}
