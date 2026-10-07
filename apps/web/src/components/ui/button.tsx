import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'good' | 'bad';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-control font-heading font-bold ' +
  'transition-[transform,box-shadow,background-color,border-color,color] duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none';

const variants: Record<ButtonVariant, string> = {
  // The "chunky" look: a darker bottom edge that compresses when pressed.
  primary:
    'bg-brand text-white shadow-[0_4px_0_var(--brand-edge)] hover:-translate-y-px hover:bg-brand-hover ' +
    'active:translate-y-[3px] active:shadow-[0_1px_0_var(--brand-edge)]',
  good:
    'bg-good text-white shadow-[0_4px_0_var(--good-edge)] hover:-translate-y-px ' +
    'active:translate-y-[3px] active:shadow-[0_1px_0_var(--good-edge)]',
  bad:
    'bg-bad text-white shadow-[0_4px_0_var(--bad-edge)] hover:-translate-y-px ' +
    'active:translate-y-[3px] active:shadow-[0_1px_0_var(--bad-edge)]',
  secondary:
    'border border-line bg-card text-ink shadow-[0_3px_0_var(--subtle)] hover:-translate-y-px hover:bg-brand-soft ' +
    'active:translate-y-0.5 active:shadow-[0_1px_0_var(--subtle)]',
  ghost: 'text-mute hover:bg-subtle hover:text-ink',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-6 text-base',
  lg: 'h-14 px-8 text-lg',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant, size, loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
