'use client';

import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import { promptClass } from './blank';
import type { RendererProps } from './types';

type Value = { answer: string };

const verdictClass = (result: RendererProps['result']) =>
  result?.verdict === 'correct'
    ? 'border-good text-good-ink'
    : result?.verdict === 'almost'
      ? 'border-flame text-amber-ink'
      : 'border-bad text-bad-ink';

/** A sentence with the gap replaced by a box to type into, right where the word belongs. */
export function FillBlank({ content, value, onChange, locked, result, onEnter }: RendererProps<ContentOf['fill_blank'], Value>) {
  const [before = '', after = ''] = content.sentence.split('___');
  const width = Math.max(8, value.answer.length + 2);

  return (
    <div className="space-y-6">
      {content.sentenceFa && (
        <div className="rounded-2xl bg-brand-soft px-5 py-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Meaning</p>
          <p className="fa text-2xl font-semibold">{content.sentenceFa}</p>
        </div>
      )}

      <p className={cn(promptClass, 'leading-[1.9]')}>
        <span className="whitespace-pre-wrap">{before}</span>
        <input
          aria-label="Your answer"
          value={value.answer}
          disabled={locked}
          onChange={(e) => onChange({ answer: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
          autoFocus
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="…"
          style={{ width: `${width}ch` }}
          className={cn(
            'mx-1 inline-block max-w-full border-b-4 bg-transparent px-1 text-center font-heading font-bold outline-none transition-colors',
            !locked && 'border-brand/50 text-brand focus:border-brand placeholder:text-brand/30',
            locked && result && cn(verdictClass(result), result.verdict === 'wrong' && 'animate-wrong'),
          )}
        />
        <span className="whitespace-pre-wrap">{after}</span>
        {content.hint && <span className="ml-2 text-xl font-semibold text-mute">{content.hint}</span>}
      </p>
    </div>
  );
}
