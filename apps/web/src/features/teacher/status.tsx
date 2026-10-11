import { AlertTriangle, CheckCircle2, Eye, Loader2, Trash2 } from 'lucide-react';
import type { IngestionStatus } from '@coach/contracts';
import { cn } from '@/lib/cn';

const META: Record<IngestionStatus, { label: string; className: string; icon: typeof Eye; spin?: boolean }> = {
  UPLOADED: { label: 'Waiting', className: 'bg-subtle text-mute', icon: Loader2, spin: true },
  EXTRACTING: { label: 'Reading', className: 'bg-brand-soft text-brand', icon: Loader2, spin: true },
  PARSING: { label: 'Understanding', className: 'bg-brand-soft text-brand', icon: Loader2, spin: true },
  AWAITING_REVIEW: { label: 'Needs review', className: 'bg-formation/15 text-amber-ink', icon: Eye },
  COMMITTED: { label: 'Saved', className: 'bg-good-soft text-good-ink', icon: CheckCircle2 },
  FAILED: { label: 'Failed', className: 'bg-bad-soft text-bad-ink', icon: AlertTriangle },
  DISCARDED: { label: 'Discarded', className: 'bg-subtle text-mute', icon: Trash2 },
};

export function StatusChip({ status, className }: { status: IngestionStatus; className?: string }) {
  const m = META[status];
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', m.className, className)}>
      <Icon className={cn('size-4', m.spin && 'animate-spin')} aria-hidden />
      {m.label}
    </span>
  );
}
