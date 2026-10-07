import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Common {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Persian text is typed right-to-left. */
  rtl?: boolean;
}

const control =
  'w-full rounded-control border bg-card px-4 text-lg text-ink outline-none transition-[border-color,box-shadow] ' +
  'placeholder:text-mute/70 focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]';

function Wrapper({
  label,
  inputId,
  error,
  hint,
  children,
}: Pick<Common, 'label' | 'error' | 'hint'> & { inputId: string; children: ReactNode }) {
  const messageId = `${inputId}-msg`;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-base font-semibold text-ink">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p id={messageId} className={cn('text-sm', error ? 'text-bad-edge' : 'text-mute')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Labelled text input. The label is always visible: placeholders are not instructions. */
export function Field({
  label,
  error,
  hint,
  rtl,
  className,
  id,
  ...props
}: Common & ComponentProps<'input'>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper label={label} inputId={inputId} error={error} hint={hint}>
      <input
        {...props}
        id={inputId}
        dir={rtl ? 'rtl' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        className={cn(control, 'h-14', rtl && 'fa', error ? 'border-bad' : 'border-line', className)}
      />
    </Wrapper>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  rtl,
  className,
  id,
  ...props
}: Common & ComponentProps<'textarea'>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper label={label} inputId={inputId} error={error} hint={hint}>
      <textarea
        rows={3}
        {...props}
        id={inputId}
        dir={rtl ? 'rtl' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        className={cn(control, 'min-h-28 resize-y py-3 leading-relaxed', rtl && 'fa', error ? 'border-bad' : 'border-line', className)}
      />
    </Wrapper>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  id,
  children,
  ...props
}: Common & ComponentProps<'select'>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Wrapper label={label} inputId={inputId} error={error} hint={hint}>
      <select
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'h-14 cursor-pointer', error ? 'border-bad' : 'border-line', className)}
      >
        {children}
      </select>
    </Wrapper>
  );
}
