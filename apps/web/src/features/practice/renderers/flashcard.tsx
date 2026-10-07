'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { rating: number };

const RATINGS = [
  { rating: 1, label: 'Again', hint: "I didn't know it", className: 'bg-bad text-white shadow-[0_4px_0_var(--bad-edge)]' },
  { rating: 2, label: 'Hard', hint: 'I barely knew it', className: 'bg-flame text-white shadow-[0_4px_0_#d98206]' },
  { rating: 3, label: 'Good', hint: 'I knew it', className: 'bg-brand text-white shadow-[0_4px_0_var(--brand-edge)]' },
  { rating: 4, label: 'Easy', hint: 'Too easy', className: 'bg-good text-white shadow-[0_4px_0_var(--good-edge)]' },
] as const;

/** A card to flip. Rating how well you knew it replaces the Check button. */
export function Flashcard({ content, locked, sendNow }: RendererProps<ContentOf['flashcard'], Value>) {
  const [flipped, setFlipped] = useState(false);

  // Space flips the card; 1 to 4 rate it once it is flipped.
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const rating = Number(e.key);
      if (flipped && rating >= 1 && rating <= 4) sendNow({ rating });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, flipped, sendNow]);

  const { front, back } = content;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? 'Show the word again' : 'Show the answer'}
        className="block h-72 w-full [perspective:1200px] focus-visible:outline-offset-4 sm:h-80"
      >
        <div
          className={cn(
            'relative size-full rounded-card transition-transform duration-500 [transform-style:preserve-3d]',
            flipped && '[transform:rotateY(180deg)]',
          )}
        >
          <div className="absolute inset-0 grid place-items-center gap-2 rounded-card border border-line bg-card p-6 text-center shadow-soft [backface-visibility:hidden]">
            <div>
              {front.note && <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-mute">{front.note}</p>}
              <p className="break-words font-heading text-5xl font-extrabold tracking-tight sm:text-6xl">{front.text}</p>
              {front.ipa && <p className="mt-3 text-xl text-mute">{front.ipa}</p>}
            </div>
            <p className="flex items-center gap-2 text-base font-semibold text-brand">
              <RotateCw className="size-4" /> Tap to flip
            </p>
          </div>

          <div className="absolute inset-0 overflow-y-auto rounded-card border border-brand/30 bg-brand-soft p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="grid min-h-full place-items-center gap-3">
              <div className="space-y-3">
                {back.meaningFa && <p className="fa text-3xl font-bold">{back.meaningFa}</p>}
                {back.meaningEn && <p className="text-xl text-mute">{back.meaningEn}</p>}
                {back.details.map((d) => (
                  <p key={d} className="rounded-xl bg-white/70 px-4 py-2 text-lg">
                    {d}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </button>

      <div
        className={cn('space-y-3 transition-opacity duration-300', flipped ? 'opacity-100' : 'pointer-events-none opacity-30')}
        aria-hidden={!flipped}
      >
        <p className="text-center text-base font-semibold text-mute">How well did you know it?</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={!flipped || locked}
              onClick={() => sendNow({ rating: r.rating })}
              className={cn(
                'rounded-2xl px-3 py-3 text-center font-heading transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed',
                r.className,
              )}
            >
              <span className="block text-lg font-bold">{r.label}</span>
              <span className="block text-sm font-medium opacity-90">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
