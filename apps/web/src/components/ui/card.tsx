import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lifts on hover; use for cards that are links or buttons. */
  interactive?: boolean;
}

export function Card({ interactive, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-card border border-line bg-card p-6 shadow-soft',
        interactive &&
          'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lift',
        className,
      )}
    />
  );
}
