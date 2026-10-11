import type { LearningStatus } from '@coach/contracts';
import { cn } from '@/lib/cn';

const STYLES: Record<LearningStatus, { label: string; className: string }> = {
  NEW: { label: 'New', className: 'bg-subtle text-mute' },
  LEARNING: { label: 'Learning', className: 'bg-grammar/12 text-grammar' },
  REVIEW: { label: 'Review', className: 'bg-brand-soft text-brand' },
  MASTERED: { label: 'Mastered', className: 'bg-good-soft text-good-ink' },
};

/** Calm, scannable mastery status. "Weak" is a flag layered on top once the SRS engine exists. */
export function MasteryChip({ status, className }: { status: LearningStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
        s.className,
        className,
      )}
    >
      <i aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
