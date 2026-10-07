'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type { ClientExercise } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { summarize, type StepRecord } from './player-state';

function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--brand)' : 'var(--flame)';
  return (
    <div className="relative size-40" role="img" aria-label={`${pct} percent`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--subtle)" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-heading text-4xl font-extrabold tracking-tight">{pct}%</span>
    </div>
  );
}

const headline = (accuracy: number, answered: number) =>
  answered === 0 ? 'No answers this time' : accuracy >= 0.85 ? 'Great session!' : accuracy >= 0.6 ? 'Good work!' : 'Practice makes progress.';

interface SummaryProps {
  exercises: ClientExercise[];
  steps: StepRecord[];
  elapsedSeconds: number;
  onAgain: () => void;
  backHref: string;
}

export function PracticeSummary({ exercises, steps, elapsedSeconds, onAgain, backHref }: SummaryProps) {
  const s = summarize(steps);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const missed = steps.filter((step) => step.result?.verdict === 'wrong');
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  const stats = [
    { label: 'Correct', value: s.correct, tone: 'text-good-edge bg-good-soft' },
    { label: 'Almost', value: s.almost, tone: 'text-[#b36b00] bg-flame/10' },
    { label: 'To review', value: s.wrong, tone: 'text-bad-edge bg-bad-soft' },
    { label: 'Skipped', value: s.skipped, tone: 'text-mute bg-subtle' },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-5 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <Ring value={s.accuracy} />
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">{headline(s.accuracy, s.answered)}</h1>
          <p className="mt-2 text-lg text-mute">
            {s.answered} answered in {minutes > 0 ? `${minutes} min ` : ''}
            {seconds} s
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={cn('rounded-2xl px-4 py-4 text-center', stat.tone)}>
            <dd className="font-heading text-3xl font-extrabold">{stat.value}</dd>
            <dt className="text-sm font-semibold">{stat.label}</dt>
          </div>
        ))}
      </dl>

      {missed.length > 0 && (
        <section className="space-y-3" aria-labelledby="review">
          <h2 id="review" className="font-heading text-2xl font-extrabold tracking-tight">
            Worth another look
          </h2>
          <ul className="space-y-3">
            {missed.map((step) => {
              const ex = byId.get(step.exerciseId);
              const r = step.result!;
              return (
                <li key={step.exerciseId}>
                  <Card className="space-y-1 p-4">
                    <p className="font-heading text-lg font-bold">{ex?.items.map((i) => i.headword).join(', ')}</p>
                    {r.correctAnswerText && <p className="whitespace-pre-line text-base text-mute">{r.correctAnswerText}</p>}
                    {r.explanationFa && <p className="fa text-base">{r.explanationFa}</p>}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={onAgain}>
          <RotateCcw className="size-5" /> Practice again
        </Button>
        <Link href={backHref} className={buttonClass('secondary', 'lg')}>
          Done
        </Link>
      </div>
    </div>
  );
}
