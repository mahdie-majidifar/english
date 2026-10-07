import { cn } from '@/lib/cn';

/** The coach's symbol: a four-point spark. Deliberately abstract — there is no mascot. */
export function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('size-6', className)}>
      <path
        d="M12 2.8 14.05 9.95 21.2 12l-7.15 2.05L12 21.2l-2.05-7.15L2.8 12l7.15-2.05L12 2.8Z"
        fill="currentColor"
      />
      <circle cx="19.1" cy="4.9" r="1.1" fill="currentColor" opacity=".72" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 place-items-center rounded-[14px] bg-brand text-white shadow-[0_4px_10px_rgba(108,77,255,.2)]',
        className,
      )}
    >
      <Spark className="size-5" />
    </span>
  );
}
