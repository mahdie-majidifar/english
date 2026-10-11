'use client';

import { Lightbulb, X } from 'lucide-react';
import type { ExerciseFormat } from '@coach/contracts';
import { FORMAT_UI } from './registry';

const KEY = (format: ExerciseFormat) => `coach:howto:${format}`;

/** Storage can be unavailable (private windows, blocked cookies); the card then simply shows every time. */
export function hasSeenHowTo(format: ExerciseFormat): boolean {
  try {
    return localStorage.getItem(KEY(format)) === '1';
  } catch {
    return false;
  }
}

export function markHowToSeen(format: ExerciseFormat): void {
  try {
    localStorage.setItem(KEY(format), '1');
  } catch {
    // Nothing to do: the card will just appear again next time.
  }
}

/** Shown the first time a format appears, and any time the "?" button is pressed. */
export function HowToCard({ format, onClose }: { format: ExerciseFormat; onClose: () => void }) {
  const { howTo } = FORMAT_UI[format];
  return (
    <section aria-label={`How ${howTo.title} works`} className="animate-[slide-up_260ms_ease-out] rounded-card border border-brand/25 bg-brand-soft p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Lightbulb className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-extrabold tracking-tight">How this works: {howTo.title}</h2>
          <ol className="mt-3 space-y-2">
            {howTo.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-base leading-snug">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-sm font-bold text-brand">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Got it, hide this"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-mute transition-colors hover:bg-card hover:text-ink"
        >
          <X className="size-5" />
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-4 rounded-xl bg-card px-4 py-2 text-base font-semibold text-brand hover:bg-card/80">
        Got it
      </button>
    </section>
  );
}
