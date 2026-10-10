'use client';

import { Flag, RotateCcw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { MistakeDto } from '@coach/contracts';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useMistakes, useMistakeSummary, type MistakeFilter } from './hooks';

const PRIORITY = {
  HIGH: 'bg-bad-soft text-bad-edge',
  MEDIUM: 'bg-flame/15 text-[#b36b00]',
  LOW: 'bg-subtle text-mute',
} as const;

const PRIORITY_LABEL = { HIGH: 'High priority', MEDIUM: 'Medium', LOW: 'Low' } as const;
const STATUS_LABEL = { ACTIVE: 'Needs work', IMPROVING: 'Improving', RESOLVED: 'Resolved' } as const;
const STATUS_TONE = {
  ACTIVE: 'bg-subtle text-mute',
  IMPROVING: 'bg-brand-soft text-brand',
  RESOLVED: 'bg-good-soft text-good-edge',
} as const;

function MistakeCard({ mistake }: { mistake: MistakeDto }) {
  const last = mistake.recent[0];
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/library/${mistake.item.id}`} className="font-heading text-2xl font-extrabold tracking-tight hover:text-brand">
            {mistake.item.headword}
          </Link>
          <p className="mt-1 text-base font-semibold text-mute">
            {mistake.errorLabelEn}
            <span className="fa ms-2 font-normal">{mistake.errorLabelFa}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mistake.repeated && (
            <span className="rounded-full bg-bad-soft px-3 py-1 text-sm font-semibold text-bad-edge">Keeps happening</span>
          )}
          {mistake.status !== 'RESOLVED' && (
            <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', PRIORITY[mistake.priority])}>
              {PRIORITY_LABEL[mistake.priority]}
            </span>
          )}
          <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', STATUS_TONE[mistake.status])}>
            {STATUS_LABEL[mistake.status]}
          </span>
        </div>
      </div>

      {last && (
        <p className="rounded-2xl bg-subtle px-4 py-3 text-lg">
          {last.expectedAnswer ? (
            <>
              <span className="text-bad-edge line-through">{last.userAnswer || '(empty)'}</span>
              <span className="mx-2 text-mute">→</span>
              <span className="font-semibold text-good-edge">{last.expectedAnswer}</span>
            </>
          ) : (
            <span className="font-semibold text-bad-edge">{last.userAnswer || '(empty)'}</span>
          )}
        </p>
      )}

      <p className="text-base text-mute">
        {mistake.occurrences} time{mistake.occurrences === 1 ? '' : 's'}
        {mistake.status === 'IMPROVING' && mistake.correctDaysNeeded > 0
          ? ` · ${mistake.correctDaysNeeded} more correct day${mistake.correctDaysNeeded === 1 ? '' : 's'} to resolve`
          : ''}
      </p>
    </Card>
  );
}

export function MistakesPage() {
  const [filter, setFilter] = useState<MistakeFilter>('open');
  const list = useMistakes(filter);
  const summary = useMistakeSummary();
  const open = (summary.data?.active ?? 0) + (summary.data?.improving ?? 0);

  const tiles: [string, number | undefined, string][] = [
    ['Needs work', summary.data?.active, 'bg-bad-soft text-bad-edge'],
    ['Improving', summary.data?.improving, 'bg-brand-soft text-brand'],
    ['Keep repeating', summary.data?.repeated, 'bg-flame/15 text-[#b36b00]'],
    ['Resolved', summary.data?.resolved, 'bg-good-soft text-good-edge'],
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">My mistakes</h1>
          <p className="mt-2 text-lg text-mute">Every mistake comes back in your sessions until you get it right on 3 different days.</p>
        </div>
        {open > 0 && (
          <Link href="/practice/play?scope=mistakes&count=10" className={buttonClass('primary', 'lg')}>
            <Sparkles className="size-5" /> Practice my mistakes
          </Link>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className={cn('rounded-2xl px-4 py-4', tone)}>
            <dd className="font-heading text-3xl font-extrabold">{value ?? '–'}</dd>
            <dt className="text-sm font-semibold">{label}</dt>
          </div>
        ))}
      </dl>

      <div role="radiogroup" aria-label="Show" className="inline-flex gap-2 rounded-control bg-subtle p-1.5">
        {(['open', 'resolved'] as const).map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-xl px-5 py-2 text-base font-semibold transition-colors',
              filter === f ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink',
            )}
          >
            {f === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <div className="h-48 animate-pulse rounded-card bg-subtle" aria-busy />
      ) : list.isError ? (
        <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
          {errorMessage(list.error)}
        </Card>
      ) : list.data.length === 0 ? (
        <Card className="grid place-items-center gap-3 border-dashed py-14 text-center">
          {filter === 'open' ? <Flag className="size-10 text-good" /> : <RotateCcw className="size-10 text-mute" />}
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">
            {filter === 'open' ? 'No open mistakes' : 'Nothing resolved yet'}
          </h2>
          <p className="max-w-md text-lg text-mute">
            {filter === 'open'
              ? 'When you miss something in a session it will show up here, with what you wrote and the right answer.'
              : 'A mistake is resolved after 3 correct answers on different days.'}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.data.map((m) => (
            <li key={m.id}>
              <MistakeCard mistake={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
