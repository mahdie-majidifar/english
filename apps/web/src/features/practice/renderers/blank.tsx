import { Fragment } from 'react';
import { cn } from '@/lib/cn';

/** Text where each "___" is shown as a visible gap, so it is obvious where the answer belongs. */
export function WithGap({ text, className }: { text: string; className?: string }) {
  const parts = text.split('___');
  return (
    <span className={className}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              aria-label="gap"
              className="mx-1 inline-block min-w-16 translate-y-0.5 border-b-4 border-brand/40 align-baseline text-transparent"
            >
              ____
            </span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

export const promptClass = cn('font-heading text-2xl font-bold leading-snug tracking-tight sm:text-3xl');
