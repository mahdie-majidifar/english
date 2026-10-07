'use client';

import { ArrowLeft, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PracticeRun } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spark } from '@/components/ui/spark';
import { errorMessage } from '@/lib/errors';
import { usePracticeRun, type PracticeParams } from './hooks';
import { PracticePlayer } from './practice-player';

const SCOPES = ['current', 'all', 'lesson', 'type', 'item', 'due', 'mistakes', 'weak'] as const;

function paramsFrom(search: URLSearchParams): PracticeParams {
  const scope = SCOPES.find((s) => s === search.get('scope')) ?? 'current';
  const count = Math.min(20, Math.max(3, Number(search.get('count')) || 10));
  return {
    scope,
    count,
    lessonId: search.get('lessonId') ?? undefined,
    itemId: search.get('itemId') ?? undefined,
    type: search.get('type') ?? undefined,
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-5 py-10">{children}</main>;
}

function Intro({ run, onStart, backHref }: { run: PracticeRun; onStart: () => void; backHref: string }) {
  const minutes = Math.max(1, Math.round(run.exercises.reduce((sum, e) => sum + e.estimatedSeconds, 0) / 60));

  // Enter starts, like every other primary action in the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <Centered>
      <Card className="w-full space-y-7 p-8 text-center sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand text-white shadow-[0_4px_0_var(--brand-edge)]">
          <Dumbbell className="size-8" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-mute">Practice</p>
          <h1 className="mt-1 font-heading text-4xl font-extrabold tracking-tight">{run.scopeLabel}</h1>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-subtle px-4 py-4">
            <dd className="font-heading text-3xl font-extrabold">{run.exercises.length}</dd>
            <dt className="text-sm font-semibold text-mute">exercises</dt>
          </div>
          <div className="rounded-2xl bg-subtle px-4 py-4">
            <dd className="font-heading text-3xl font-extrabold">~{minutes} min</dd>
            <dt className="text-sm font-semibold text-mute">about</dt>
          </div>
        </dl>
        <p className="text-lg text-mute">Each exercise tells you what to do. Your answers are saved as you go.</p>
        <div className="space-y-3">
          <Button size="lg" className="w-full" onClick={onStart} autoFocus>
            Start
          </Button>
          <Link href={backHref} className="inline-block text-base font-semibold text-mute hover:text-ink">
            Not now
          </Link>
        </div>
      </Card>
    </Centered>
  );
}

export function PlayPage() {
  const search = useSearchParams();
  const params = useMemo(() => paramsFrom(search), [search]);
  const build = usePracticeRun();
  const [run, setRun] = useState<PracticeRun | null>(null);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const builtRound = useRef(-1);

  // Build once per round (React may run effects twice in development).
  useEffect(() => {
    if (builtRound.current === round) return;
    builtRound.current = round;
    setRun(null);
    setStarted(false);
    build.mutate(params, { onSuccess: setRun });
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const backHref = params.scope === 'item' && params.itemId ? `/library/${params.itemId}` : '/practice';

  if (build.isError) {
    return (
      <Centered>
        <Card role="alert" className="space-y-4 border-bad/40 bg-bad-soft text-center">
          <p className="text-lg font-semibold text-bad-edge">{errorMessage(build.error, 'We could not build your practice.')}</p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => setRound((r) => r + 1)}>Try again</Button>
            <Link href={backHref} className={buttonClass('secondary', 'md')}>
              Back
            </Link>
          </div>
        </Card>
      </Centered>
    );
  }

  if (!run) {
    return (
      <Centered>
        <div className="space-y-4 text-center" aria-busy aria-live="polite">
          <Spark className="mx-auto size-14 animate-spin text-brand [animation-duration:1.8s]" />
          <p className="font-heading text-xl font-bold">Building your practice…</p>
        </div>
      </Centered>
    );
  }

  if (run.exercises.length === 0) {
    return (
      <Centered>
        <Card className="w-full space-y-4 text-center">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Nothing to practice yet</h1>
          <p className="text-lg text-mute">
            {run.scopeLabel === 'Your library' || params.scope === 'all'
              ? 'Add some words or grammar first, then come back.'
              : `There are no items in “${run.scopeLabel}” yet.`}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/library/new" className={buttonClass('primary', 'md')}>
              Add an item
            </Link>
            <Link href="/teacher/new" className={buttonClass('secondary', 'md')}>
              Add teacher notes
            </Link>
          </div>
          <Link href={backHref} className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Card>
      </Centered>
    );
  }

  if (!started) return <Intro run={run} onStart={() => setStarted(true)} backHref={backHref} />;

  return <PracticePlayer key={round} run={run} onAgain={() => setRound((r) => r + 1)} backHref={backHref} />;
}
