'use client';

import { ArrowRight } from 'lucide-react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { past: string; pastParticiple: string };

type FieldVerdict = 'correct' | 'almost' | 'wrong';

function FormInput({
  label,
  hint,
  value,
  onChange,
  disabled,
  verdict,
  autoFocus,
  onEnter,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  verdict?: FieldVerdict;
  autoFocus?: boolean;
  onEnter: () => void;
}) {
  return (
    <label className="block flex-1 space-y-2">
      <span className="block text-center">
        <span className="font-heading text-lg font-bold">{label}</span>
        <span className="block text-sm text-mute">{hint}</span>
      </span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          'h-16 w-full rounded-2xl border-2 bg-card px-4 text-center font-heading text-2xl font-bold outline-none transition-[border-color,box-shadow,background-color]',
          !verdict && 'border-line focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]',
          verdict === 'correct' && 'border-good bg-good-soft text-good-edge',
          verdict === 'almost' && 'border-flame bg-flame/10 text-[#b36b00]',
          verdict === 'wrong' && 'animate-wrong border-bad bg-bad-soft text-bad-edge',
        )}
      />
    </label>
  );
}

/** wear → [ ? ] → [ ? ]: the first form is given, the other two are typed. */
export function IrregularForms({ content, value, onChange, locked, result, onEnter }: RendererProps<ContentOf['irregular_verb_forms'], Value>) {
  const detail = result?.detail as { past?: FieldVerdict; pastParticiple?: FieldVerdict } | undefined;
  return (
    <div className="space-y-5">
      {content.meaningFa && <p className="fa text-center text-2xl font-semibold">{content.meaningFa}</p>}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1 space-y-2">
          <span className="block text-center">
            <span className="font-heading text-lg font-bold">V1</span>
            <span className="block text-sm text-mute">base form</span>
          </span>
          <p className="grid h-16 place-items-center rounded-2xl bg-verbs/15 font-heading text-2xl font-extrabold">{content.base}</p>
        </div>
        <ArrowRight aria-hidden className="mx-auto hidden size-6 shrink-0 self-end pb-5 text-mute sm:block" />
        <FormInput
          label="V2"
          hint="past simple"
          value={value.past}
          onChange={(past) => onChange({ ...value, past })}
          disabled={locked}
          verdict={locked ? detail?.past : undefined}
          autoFocus
          onEnter={onEnter}
        />
        <ArrowRight aria-hidden className="mx-auto hidden size-6 shrink-0 self-end pb-5 text-mute sm:block" />
        <FormInput
          label="V3"
          hint="past participle"
          value={value.pastParticiple}
          onChange={(pastParticiple) => onChange({ ...value, pastParticiple })}
          disabled={locked}
          verdict={locked ? detail?.pastParticiple : undefined}
          onEnter={onEnter}
        />
      </div>
    </div>
  );
}
