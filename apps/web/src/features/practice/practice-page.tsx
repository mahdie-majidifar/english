'use client';

import { BookOpen, Flag, Library, Plus, RotateCw, Target } from 'lucide-react';
import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { ITEM_TYPE_META } from '@coach/contracts';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MODES } from '@/components/ui/skill-chip';
import { cn } from '@/lib/cn';
import { useCurrent } from '@/features/catalog/hooks';
import { useItems } from '@/features/content/hooks';
import { useDashboard } from '@/features/dashboard/hooks';
import { TYPE_ORDER } from '@/features/library/type-ui';

const COUNTS = [5, 10, 15];

export function PracticePage() {
  const current = useCurrent();
  const items = useItems({});
  const dashboard = useDashboard();
  const [count, setCount] = useState(10);

  const counts = items.data?.pages[0]?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const href = (query: string) => `/practice/play?${query}&count=${count}`;

  // Smart groups only appear when there is something in them.
  const stats = dashboard.data;
  const openMistakes = (stats?.mistakes.active ?? 0) + (stats?.mistakes.improving ?? 0);
  const weak = stats?.weakAreas.reduce((n, a) => n + a.items.length, 0) ?? 0;
  const focus = [
    { scope: 'due', icon: RotateCw, tone: 'bg-brand-soft text-brand', title: 'Due for review', n: stats?.reviews.dueCount ?? 0, body: 'Items you are about to forget.' },
    { scope: 'mistakes', icon: Flag, tone: 'bg-bad-soft text-bad-ink', title: 'My mistakes', n: openMistakes, body: 'Things you got wrong before.' },
    { scope: 'weak', icon: Target, tone: 'bg-flame/15 text-amber-ink', title: 'Weak items', n: weak, body: 'Items you often miss.' },
  ]
    .filter((c) => c.n > 0)
    .map((c) => ({ ...c, body: `${c.n} · ${c.body}` }));

  if (items.isPending || current.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;

  if (total === 0) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Practice</h1>
          <p className="mt-2 text-lg text-mute">Short exercises on the words and grammar you are learning.</p>
        </header>
        <Card className="grid place-items-center gap-4 border-dashed py-16 text-center">
          <Library className="size-10 text-brand" />
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Add something to practice</h2>
          <p className="max-w-md text-lg text-mute">Your library is empty. Add words and grammar, or let the coach read your teacher notes.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/teacher/new" className={buttonClass('primary', 'lg')}>
              <Plus className="size-5" /> Add teacher notes
            </Link>
            <Link href="/library/new" className={buttonClass('secondary', 'lg')}>
              Add an item
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Practice</h1>
          <p className="mt-2 text-lg text-mute">Pick what to practice. Each exercise tells you what to do.</p>
        </div>
        <div role="radiogroup" aria-label="Number of exercises" className="flex items-center gap-2 rounded-control bg-subtle p-1.5">
          {COUNTS.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={cn(
                'rounded-xl px-4 py-2 text-base font-semibold transition-colors',
                count === n ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink',
              )}
            >
              {n} exercises
            </button>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {current.data ? (
          <Link href={href('scope=current')} className="block focus-visible:outline-offset-4 sm:col-span-2">
            <Card interactive className="flex flex-wrap items-center gap-5 border-0 bg-brand p-6 text-white shadow-lift hover:border-0">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20">
                <BookOpen className="size-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold uppercase tracking-wide text-white/80">Recommended</p>
                <h2 className="font-heading text-2xl font-extrabold tracking-tight">
                  Your current lesson: {current.data.lesson.code} · {current.data.lesson.title}
                </h2>
                <p className="mt-1 text-base text-white/85">
                  {current.data.itemCount} item{current.data.itemCount === 1 ? '' : 's'} from {current.data.book.title}
                </p>
              </div>
              <span className="rounded-control bg-white px-5 py-3 font-heading font-bold text-brand">Start</span>
            </Card>
          </Link>
        ) : null}

        {focus.map((card) => (
          <Link key={card.scope} href={href(`scope=${card.scope}`)} className="block focus-visible:outline-offset-4">
            <Card interactive className="flex h-full items-center gap-4 p-5">
              <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', card.tone)}>
                <card.icon className="size-6" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-extrabold tracking-tight">{card.title}</h2>
                <p className="text-base text-mute">{card.body}</p>
              </div>
            </Card>
          </Link>
        ))}

        <Link href={href('scope=all')} className="block focus-visible:outline-offset-4">
          <Card interactive className="flex h-full items-center gap-4 p-5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Library className="size-6" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-extrabold tracking-tight">Everything I have learned</h2>
              <p className="text-base text-mute">{total} items. Starts with what you practised least.</p>
            </div>
          </Card>
        </Link>
      </section>

      <section className="space-y-4" aria-labelledby="by-type">
        <h2 id="by-type" className="font-heading text-2xl font-extrabold tracking-tight">
          By type
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((type) => {
            const meta = ITEM_TYPE_META[type];
            return (
              <Link key={type} href={href(`scope=type&type=${type}`)} className="block focus-visible:outline-offset-4">
                <Card
                  interactive
                  style={{ '--mode': MODES[meta.mode].color } as CSSProperties}
                  className="flex items-center gap-4 border-l-4 border-l-[var(--mode)] p-4"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--mode)_14%,var(--card))] font-heading text-xl font-extrabold text-[var(--mode)]">
                    {counts[type]}
                  </span>
                  <span className="font-heading text-lg font-bold">{meta.plural}</span>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
