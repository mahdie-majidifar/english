'use client';

import { ArrowRight } from 'lucide-react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { answer: string };

/** fail → [ noun form ]: the base word is given, the learner types the related form. */
export function WordFormation({ content, value, onChange, locked, result, onEnter }: RendererProps<ContentOf['word_formation'], Value>) {
  return (
    <div className="space-y-6">
      {content.sentence && <p className="rounded-2xl bg-subtle px-5 py-4 text-xl">{content.sentence}</p>}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <p className="grid min-h-16 min-w-40 place-items-center rounded-2xl bg-formation/20 px-6 font-heading text-3xl font-extrabold">
          {content.base}
        </p>
        <div className="flex items-center gap-3 text-mute">
          <ArrowRight aria-hidden className="size-6 rotate-90 sm:rotate-0" />
          <span className="rounded-full bg-formation/20 px-4 py-1.5 font-heading text-base font-bold text-amber-ink">
            {content.targetPos}
          </span>
          <ArrowRight aria-hidden className="size-6 rotate-90 sm:rotate-0" />
        </div>
        <input
          aria-label={`The ${content.targetPos} form of ${content.base}`}
          value={value.answer}
          disabled={locked}
          onChange={(e) => onChange({ answer: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          autoFocus
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Type it here"
          className={cn(
            'h-16 w-full min-w-0 rounded-2xl border-2 bg-card px-4 text-center font-heading text-2xl font-bold outline-none transition-[border-color,box-shadow,background-color] sm:w-64',
            !result && 'border-line focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]',
            result?.verdict === 'correct' && 'border-good bg-good-soft text-good-ink',
            result?.verdict === 'almost' && 'border-flame bg-flame/10 text-amber-ink',
            result?.verdict === 'wrong' && 'animate-wrong border-bad bg-bad-soft text-bad-ink',
          )}
        />
      </div>
    </div>
  );
}
