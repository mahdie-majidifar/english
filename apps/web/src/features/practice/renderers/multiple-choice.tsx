'use client';

import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import { promptClass, WithGap } from './blank';
import type { RendererProps } from './types';

type Value = { optionId: string };

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

export function MultipleChoice({
  content,
  value,
  onChange,
  locked,
  result,
}: RendererProps<ContentOf['multiple_choice'], Value>) {
  const correctId = result?.detail['correctOptionId'] as string | undefined;

  // 1, 2, 3, 4: pick an option from the keyboard.
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const option = content.options[Number(e.key) - 1];
      if (option) onChange({ optionId: option.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, content.options, onChange]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className={promptClass}>
          <WithGap text={content.prompt} />
        </p>
        {content.promptFa && <p className="fa rounded-2xl bg-brand-soft px-5 py-4 text-2xl font-semibold">{content.promptFa}</p>}
      </div>

      <div role="radiogroup" aria-label="Answers" className="grid gap-3 sm:grid-cols-2">
        {content.options.map((option, index) => {
          const selected = value.optionId === option.id;
          const isCorrect = locked && option.id === correctId;
          const isWrongPick = locked && selected && option.id !== correctId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => onChange({ optionId: option.id })}
              className={cn(
                'flex min-h-16 items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left text-xl font-semibold transition-[transform,border-color,background-color,box-shadow,opacity] duration-150',
                !locked && !selected && 'border-line bg-card hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft',
                !locked && selected && 'border-brand bg-brand-soft shadow-[0_0_0_4px_var(--brand-soft)]',
                isCorrect && 'animate-correct border-good bg-good-soft',
                isWrongPick && 'animate-wrong border-bad bg-bad-soft',
                locked && !isCorrect && !isWrongPick && 'border-line bg-card opacity-55',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl border-2 text-base font-bold transition-colors',
                  selected && !locked && 'border-brand bg-brand text-white',
                  isCorrect && 'border-good bg-good text-white',
                  isWrongPick && 'border-bad bg-bad text-white',
                  !selected && !isCorrect && 'border-line text-mute',
                )}
              >
                {isCorrect ? <Check className="size-5" strokeWidth={3} /> : isWrongPick ? <X className="size-5" strokeWidth={3} /> : index + 1}
              </span>
              <span className={cn('min-w-0 flex-1 break-words', option.rtl && 'fa')} dir={option.rtl ? 'rtl' : undefined}>
                {option.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
