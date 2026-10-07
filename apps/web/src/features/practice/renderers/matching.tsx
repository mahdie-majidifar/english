'use client';

import { useState } from 'react';
import type { ContentOf } from '@coach/contracts';
import { cn } from '@/lib/cn';
import type { RendererProps } from './types';

type Value = { pairs: Record<string, string> };

/** Each pair gets its own colour on both sides, so you can see what is connected to what. */
const PAIR_COLORS = ['#7c5cff', '#2f80ff', '#12b5a6', '#f5a524', '#f0568c', '#8bc34a'];

export function Matching({ content, value, onChange, locked, result }: RendererProps<ContentOf['matching'], Value>) {
  const [selected, setSelected] = useState<string | null>(null);
  const results = (result?.detail['results'] ?? null) as Record<string, boolean> | null;

  const leftIndex = new Map(content.left.map((l, i) => [l.id, i]));
  const colorOfLeft = (id: string) => PAIR_COLORS[(leftIndex.get(id) ?? 0) % PAIR_COLORS.length]!;
  const leftOfRight = (rightId: string) => Object.keys(value.pairs).find((l) => value.pairs[l] === rightId);

  function pickLeft(id: string) {
    if (locked) return;
    if (value.pairs[id]) {
      // Tapping a connected word disconnects it.
      const { [id]: _removed, ...rest } = value.pairs;
      onChange({ pairs: rest });
      setSelected(id);
      return;
    }
    setSelected((current) => (current === id ? null : id));
  }

  function pickRight(rightId: string) {
    if (locked || !selected) return;
    const pairs = { ...value.pairs };
    const previousOwner = leftOfRight(rightId);
    if (previousOwner) delete pairs[previousOwner];
    pairs[selected] = rightId;
    onChange({ pairs });
    setSelected(null);
  }

  const itemClass = (state: 'idle' | 'selected' | 'paired' | 'correct' | 'wrong', color?: string) =>
    cn(
      'flex min-h-14 w-full items-center rounded-2xl border-2 px-4 py-3 text-left text-lg font-semibold transition-[transform,border-color,background-color,opacity] duration-150',
      state === 'idle' && 'border-line bg-card hover:-translate-y-0.5 hover:border-brand/40',
      state === 'selected' && 'border-brand bg-brand-soft shadow-[0_0_0_4px_var(--brand-soft)]',
      state === 'paired' && 'bg-[color-mix(in_srgb,var(--pair)_12%,white)] border-[var(--pair)]',
      state === 'correct' && 'border-good bg-good-soft',
      state === 'wrong' && 'animate-wrong border-bad bg-bad-soft',
      color && '[--pair:var(--c)]',
    );

  return (
    <div className="space-y-4">
      <p className="text-center text-base font-semibold text-mute">
        {Object.keys(value.pairs).length} of {content.left.length} matched
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <ul className="space-y-3" aria-label="Words">
          {content.left.map((l) => {
            const paired = Boolean(value.pairs[l.id]);
            const state = locked && results ? (results[l.id] ? 'correct' : 'wrong') : selected === l.id ? 'selected' : paired ? 'paired' : 'idle';
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={selected === l.id}
                  disabled={locked}
                  onClick={() => pickLeft(l.id)}
                  style={{ '--c': colorOfLeft(l.id) } as React.CSSProperties}
                  className={itemClass(state, colorOfLeft(l.id))}
                >
                  {l.text}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="space-y-3" aria-label="Meanings">
          {content.right.map((r) => {
            const owner = leftOfRight(r.id);
            const state = locked && results && owner ? (results[owner] ? 'correct' : 'wrong') : owner ? 'paired' : 'idle';
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={locked || !selected}
                  onClick={() => pickRight(r.id)}
                  style={owner ? ({ '--c': colorOfLeft(owner) } as React.CSSProperties) : undefined}
                  className={cn(itemClass(state, owner ? colorOfLeft(owner) : undefined), r.rtl && 'fa justify-end', !selected && !owner && !locked && 'opacity-80')}
                  dir={r.rtl ? 'rtl' : undefined}
                >
                  {r.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
