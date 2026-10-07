import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Every learning mode has one fixed colour, so users always know where they are. */
export const MODES = {
  vocabulary: { label: 'Vocabulary', color: 'var(--vocab)' },
  grammar: { label: 'Grammar', color: 'var(--grammar)' },
  collocations: { label: 'Collocations', color: 'var(--colloc)' },
  formation: { label: 'Word formation', color: 'var(--formation)' },
  expressions: { label: 'Expressions', color: 'var(--expr)' },
  verbs: { label: 'Irregular verbs', color: 'var(--verbs)' },
  mistakes: { label: 'Mistakes', color: 'var(--mistake)' },
  review: { label: 'Review', color: 'var(--brand)' },
} as const;

export type Mode = keyof typeof MODES;

export function SkillChip({ mode, label, className }: { mode: Mode; label?: string; className?: string }) {
  const m = MODES[mode];
  return (
    <span
      style={{ '--mode': m.color } as CSSProperties}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold',
        'bg-[color-mix(in_srgb,var(--mode)_12%,white)] text-[var(--mode)]',
        className,
      )}
    >
      <i aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? m.label}
    </span>
  );
}
