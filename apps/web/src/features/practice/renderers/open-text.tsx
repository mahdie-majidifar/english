'use client';

import { Check } from 'lucide-react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { answer: string };

type OpenContent = ContentOf['translation_fa_en'] | ContentOf['free_production'] | ContentOf['transformation'];

function Prompt({ content }: { content: OpenContent }) {
  if ('promptFa' in content) {
    return <p className="fa rounded-2xl bg-brand-soft px-5 py-5 text-3xl font-semibold leading-relaxed">{content.promptFa}</p>;
  }
  if ('source' in content) {
    return (
      <div className="space-y-3">
        <blockquote className="rounded-2xl border-l-4 border-brand bg-subtle px-5 py-4 text-2xl font-semibold leading-snug">
          {content.source}
        </blockquote>
        <p className="inline-block rounded-full bg-grammar/12 px-4 py-1.5 text-base font-bold text-grammar">{content.task}</p>
      </div>
    );
  }
  return <p className="font-heading text-2xl font-bold leading-snug sm:text-3xl">{content.prompt}</p>;
}

/** Free-text exercises: translate, rewrite, or write your own sentence. The AI judges these. */
export function OpenText({ content, value, onChange, locked, result, onEnter }: RendererProps<OpenContent, Value>) {
  const targets = 'targetWords' in content ? content.targetWords : [];
  const lower = value.answer.toLowerCase();

  return (
    <div className="space-y-5">
      <Prompt content={content} />

      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Words to use">
          <span className="text-base font-semibold text-mute">Use:</span>
          {targets.map((w) => {
            const used = lower.includes(w.toLowerCase());
            return (
              <span
                key={w}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-base font-semibold transition-colors',
                  used ? 'border-good bg-good-soft text-good-edge' : 'border-line bg-card text-ink',
                )}
              >
                {used && <Check className="size-4" strokeWidth={3} />}
                {w}
              </span>
            );
          })}
        </div>
      )}

      <textarea
        aria-label="Your answer"
        value={value.answer}
        disabled={locked}
        onChange={(e) => onChange({ answer: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onEnter();
        }}
        rows={4}
        autoFocus
        autoComplete="off"
        spellCheck
        placeholder="Write your answer in English…"
        className={cn(
          'w-full resize-y rounded-2xl border-2 bg-card px-5 py-4 text-2xl leading-relaxed outline-none transition-[border-color,box-shadow,background-color]',
          !result && 'border-line focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]',
          result?.verdict === 'correct' && 'border-good bg-good-soft',
          result?.verdict === 'almost' && 'border-flame bg-flame/10',
          result?.verdict === 'wrong' && 'animate-wrong border-bad bg-bad-soft',
        )}
      />
      {!locked && <p className="text-sm text-mute">Press Ctrl + Enter to check.</p>}
    </div>
  );
}
