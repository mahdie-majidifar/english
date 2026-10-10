'use client';

import { useEffect, useState } from 'react';
import { countUpValue } from '@/lib/count-up';

/** A number that counts up to its value when it first appears. Shows the final value at once for people who prefer less motion. */
export function CountUp({ value, durationMs = 800 }: { value: number; durationMs?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value <= 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setShown(countUpValue(value, now - start, durationMs));
      if (now - start < durationMs) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span aria-label={String(value)}>{shown}</span>;
}
