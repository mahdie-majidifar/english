'use client';

import { ArrowLeft, Check, Flame, Play, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BLOCK_LABELS,
  SESSION_BLOCKS,
  type DailySessionDto,
  type DailySessionEnvelope,
  type SelectionReason,
  type SessionResultDto,
} from '@coach/contracts';
import { NewAchievements } from '@/components/ui/achievement-badge';
import { CountUp } from '@/components/ui/count-up';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreRing } from '@/components/ui/score-ring';
import { Spark } from '@/components/ui/spark';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { PracticePlayer } from '@/features/practice/practice-player';
import { useCompleteSession, useOpenSession } from './hooks';

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-5 py-10">{children}</main>;
}

/** The reasons behind the plan, in plain words. */
const REASON_LINES: Record<SelectionReason, (n: number) => string> = {
  DUE_REVIEW: (n) => `${n} review${n === 1 ? '' : 's'} due`,
  MISTAKE: (n) => `${n} you missed before`,
  WEAK_AREA: (n) => `${n} that need more practice`,
  NEW_CONTENT: (n) => `${n} new from your lesson`,
  TEACHER_ASSIGNED: (n) => `${n} from your teacher's class`,
  RECOVERY: (n) => `${n} to try again`,
};

function ResultView({ result, onMore }: { result: SessionResultDto; onMore: () => void }) {
  const minutes = Math.max(1, Math.round(result.activeSeconds / 60));
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-5 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <ScoreRing value={result.accuracy} />
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Session complete!</h1>
          <p className="mt-2 text-lg text-mute">
            {result.answered} answered in about {minutes} min
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-4 border-xp/40 bg-xp/10 p-5">
          <span className="grid size-14 shrink-0 animate-[pop-in_420ms_ease-out] place-items-center rounded-2xl bg-xp text-white">
            <Star className="size-7" fill="currentColor" />
          </span>
          <div>
            <p className="font-heading text-3xl font-extrabold">
              +<CountUp value={result.xpEarned} /> XP
            </p>
            <p className="text-base font-semibold text-mute">earned today</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 border-flame/40 bg-flame/10 p-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-flame text-white">
            <Flame className="size-7 animate-flicker" fill="currentColor" />
          </span>
          <div>
            <p className="font-heading text-3xl font-extrabold">
              {result.streak.current} day{result.streak.current === 1 ? '' : 's'}
            </p>
            <p className="text-base font-semibold text-mute">
              {result.streak.goalMetToday ? 'Daily goal reached' : 'streak'} · best {result.streak.longest}
            </p>
          </div>
        </Card>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          ['Correct', result.correct, 'bg-good-soft text-good-ink'],
          ['Almost', result.almost, 'bg-flame/10 text-amber-ink'],
          ['To review', result.wrong, 'bg-bad-soft text-bad-ink'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className={cn('rounded-2xl px-4 py-4 text-center', String(tone))}>
            <dd className="font-heading text-3xl font-extrabold">{String(value)}</dd>
            <dt className="text-sm font-semibold">{String(label)}</dt>
          </div>
        ))}
      </dl>

      <NewAchievements badges={result.newAchievements ?? []} />

      {result.wrong > 0 && (
        <p className="rounded-2xl bg-subtle px-5 py-4 text-lg text-mute">
          The ones you missed are saved in <Link href="/mistakes" className="font-semibold text-brand underline">your mistakes</Link>. They will come back
          in your next sessions until they stick.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/" className={buttonClass('primary', 'lg')}>
          Done
        </Link>
        <Button variant="secondary" size="lg" onClick={onMore}>
          <Sparkles className="size-5" /> Practice more
        </Button>
      </div>
    </div>
  );
}

/** Finishes the session on the server (once) and shows what it earned. */
function SessionDone({ sessionId, onMore }: { sessionId: string; onMore: () => void }) {
  const complete = useCompleteSession(sessionId);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    complete.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (complete.isError) {
    return (
      <Centered>
        <Card className="w-full space-y-4 text-center">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">No answers this time</h1>
          <p className="text-lg text-mute">{errorMessage(complete.error, 'We could not finish the session.')}</p>
          <div className="flex justify-center gap-3">
            <Link href="/" className={buttonClass('primary', 'md')}>
              Back home
            </Link>
          </div>
        </Card>
      </Centered>
    );
  }
  if (!complete.data) {
    return (
      <Centered>
        <Spark className="size-14 animate-spin text-brand [animation-duration:1.8s]" />
      </Centered>
    );
  }
  return <ResultView result={complete.data} onMore={onMore} />;
}

function Intro({ session, onStart }: { session: DailySessionDto; onStart: () => void }) {
  const remaining = session.exercises.filter((e) => !e.answered);
  const resuming = session.answeredCount > 0;
  const minutes = Math.max(1, Math.round(remaining.reduce((s, e) => s + e.estimatedSeconds, 0) / 60));

  const blocks = SESSION_BLOCKS.map((b) => ({ block: b, count: remaining.filter((e) => e.block === b).length })).filter((b) => b.count > 0);
  const reasons = (Object.entries(session.summary) as [SelectionReason, number][]).filter(([, n]) => n > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <Centered>
      <Card className="w-full space-y-7 p-8 sm:p-10">
        <div className="space-y-3 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand text-white shadow-[0_4px_0_var(--brand-edge)]">
            <Spark className="size-8" />
          </span>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">
            {resuming ? 'Continue today’s session' : session.ordinal > 1 ? 'One more session' : 'Today’s session'}
          </h1>
          <p className="text-lg text-mute">
            {remaining.length} exercise{remaining.length === 1 ? '' : 's'} · about {minutes} min
            {resuming ? ` · ${session.answeredCount} already done` : ''}
          </p>
        </div>

        {reasons.length > 0 && (
          <section aria-labelledby="why" className="space-y-3">
            <h2 id="why" className="text-sm font-semibold uppercase tracking-wide text-mute">
              Why these exercises
            </h2>
            <ul className="flex flex-wrap gap-2">
              {reasons.map(([reason, n]) => (
                <li key={reason} className="rounded-full bg-brand-soft px-4 py-1.5 text-base font-semibold text-brand">
                  {REASON_LINES[reason](n)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ol className="space-y-2" aria-label="Plan">
          {blocks.map(({ block, count }, i) => (
            <li key={block} className="flex items-center gap-4 rounded-2xl bg-subtle px-4 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-card font-heading text-sm font-bold">{i + 1}</span>
              <span className="flex-1 text-lg font-semibold">{BLOCK_LABELS[block]}</span>
              <span className="text-base text-mute">{count}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-3 text-center">
          <Button size="lg" className="w-full" onClick={onStart} autoFocus>
            <Play className="size-5" fill="currentColor" /> {resuming ? 'Continue' : 'Start'}
          </Button>
          <Link href="/" className="inline-block text-base font-semibold text-mute hover:text-ink">
            Not now
          </Link>
        </div>
      </Card>
    </Centered>
  );
}

function DoneForToday({ session, onMore }: { session: DailySessionDto; onMore: () => void }) {
  return session.result ? (
    <ResultView result={session.result} onMore={onMore} />
  ) : (
    <Centered>
      <Card className="w-full space-y-4 text-center">
        <Check className="mx-auto size-10 text-good" strokeWidth={3} />
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Done for today</h1>
        <Button onClick={onMore}>Practice more</Button>
      </Card>
    </Centered>
  );
}

export function SessionPage() {
  const search = useSearchParams();
  const extra = search.get('extra') === '1';
  const open = useOpenSession();
  const [envelope, setEnvelope] = useState<DailySessionEnvelope | null>(null);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const builtRound = useRef(-1);

  useEffect(() => {
    if (builtRound.current === round) return;
    builtRound.current = round;
    setEnvelope(null);
    setStarted(false);
    open.mutate(extra || round > 0, { onSuccess: setEnvelope });
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const session = envelope?.session ?? null;
  const unanswered = useMemo(() => session?.exercises.filter((e) => !e.answered) ?? [], [session]);

  if (open.isError) {
    return (
      <Centered>
        <Card role="alert" className="w-full space-y-4 border-bad/40 bg-bad-soft text-center">
          <p className="text-lg font-semibold text-bad-ink">{errorMessage(open.error, 'We could not plan your session.')}</p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => setRound((r) => r + 1)}>Try again</Button>
            <Link href="/" className={buttonClass('secondary', 'md')}>
              Back
            </Link>
          </div>
        </Card>
      </Centered>
    );
  }

  if (!envelope) {
    return (
      <Centered>
        <div className="space-y-4 text-center" aria-busy aria-live="polite">
          <Spark className="mx-auto size-14 animate-spin text-brand [animation-duration:1.8s]" />
          <p className="font-heading text-xl font-bold">Planning your session…</p>
        </div>
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered>
        <Card className="w-full space-y-4 text-center">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">Nothing to practice yet</h1>
          <p className="text-lg text-mute">
            Add words or grammar from your class, then come back. Your session is built from what you are learning.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/teacher/new" className={buttonClass('primary', 'md')}>
              Add teacher notes
            </Link>
            <Link href="/library/new" className={buttonClass('secondary', 'md')}>
              Add an item
            </Link>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
            <ArrowLeft className="size-4" /> Back home
          </Link>
        </Card>
      </Centered>
    );
  }

  if (session.status === 'COMPLETED') return <DoneForToday session={session} onMore={() => setRound((r) => r + 1)} />;
  if (unanswered.length === 0) return <SessionDone sessionId={session.id} onMore={() => setRound((r) => r + 1)} />;
  if (!started) return <Intro session={session} onStart={() => setStarted(true)} />;

  return (
    <PracticePlayer
      key={session.id}
      run={{ exercises: unanswered }}
      onAgain={() => setRound((r) => r + 1)}
      backHref="/"
      renderDone={() => <SessionDone sessionId={session.id} onMore={() => setRound((r) => r + 1)} />}
    />
  );
}
