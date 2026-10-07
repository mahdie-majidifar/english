'use client';

import { LayoutGroup, motion } from 'motion/react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { order: number[] };

const spring = { type: 'spring', stiffness: 520, damping: 34 } as const;

function Tile({
  word,
  id,
  onClick,
  disabled,
  state,
}: {
  word: string;
  id: string;
  onClick: () => void;
  disabled: boolean;
  state?: 'wrong' | 'ok';
}) {
  return (
    <motion.button
      layout
      layoutId={id}
      transition={spring}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-xl border-2 bg-card px-4 py-2.5 text-xl font-semibold shadow-[0_3px_0_var(--line)] active:translate-y-0.5',
        !state && 'border-line hover:border-brand/50',
        state === 'ok' && 'border-good bg-good-soft shadow-[0_3px_0_var(--good-edge)]',
        state === 'wrong' && 'border-bad bg-bad-soft shadow-[0_3px_0_var(--bad-edge)]',
        disabled && 'cursor-default',
      )}
    >
      {word}
    </motion.button>
  );
}

/** Tap words to build the sentence; tap a word in your sentence to take it back. */
export function SentenceOrder({ content, value, onChange, locked, result }: RendererProps<ContentOf['sentence_order'], Value>) {
  const used = new Set(value.order);
  const firstWrong = result?.detail['firstWrongIndex'] as number | undefined;

  const add = (index: number) => !locked && onChange({ order: [...value.order, index] });
  const remove = (position: number) => !locked && onChange({ order: value.order.filter((_, i) => i !== position) });

  return (
    <div className="space-y-6">
      {content.translationFa && <p className="fa rounded-2xl bg-brand-soft px-5 py-4 text-2xl font-semibold">{content.translationFa}</p>}

      <LayoutGroup>
        <div
          aria-label="Your sentence"
          className={cn(
            'flex min-h-24 flex-wrap content-start gap-2.5 rounded-card border-2 border-dashed p-4 transition-colors',
            value.order.length === 0 ? 'border-brand/40 bg-brand-soft/40' : 'border-line bg-card',
            result?.verdict === 'wrong' && 'animate-wrong',
          )}
        >
          {value.order.length === 0 && <p className="self-center text-lg text-mute">Your sentence goes here. Tap the words below.</p>}
          {value.order.map((tokenIndex, position) => (
            <Tile
              key={tokenIndex}
              id={`tok-${tokenIndex}`}
              word={content.tokens[tokenIndex]!}
              disabled={locked}
              onClick={() => remove(position)}
              state={locked && result ? (result.isCorrect ? 'ok' : position === firstWrong ? 'wrong' : undefined) : undefined}
            />
          ))}
        </div>

        <div aria-label="Words to use" className="flex min-h-16 flex-wrap justify-center gap-2.5">
          {content.tokens.map((word, index) =>
            used.has(index) ? (
              <span key={index} aria-hidden className="h-[3.25rem] rounded-xl bg-subtle px-4 py-2.5 text-xl text-transparent">
                {word}
              </span>
            ) : (
              <Tile key={index} id={`tok-${index}`} word={word} disabled={locked} onClick={() => add(index)} />
            ),
          )}
        </div>
      </LayoutGroup>
    </div>
  );
}
