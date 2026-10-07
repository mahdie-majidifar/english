'use client';

import { ArrowRight, Check, Clock, Dumbbell, Flag, Flame, Play, RotateCw, Star, Target } from 'lucide-react';
import Link from 'next/link';
import type { DashboardDto, SelectionReason } from '@coach/contracts';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spark } from '@/components/ui/spark';
import { errorMessage } from '@/lib/errors';
import { CurrentFocus, GettingStarted } from './getting-started';
import { useDashboard } from './hooks';

const SHORT_REASON: Record<SelectionReason, string> = {
  DUE_REVIEW: 'due reviews',
  MISTAKE: 'past mistakes',
  WEAK_AREA: 'weak spots',
  NEW_CONTENT: 'new items',
  TEACHER_ASSIGNED: 'teacher notes',
  RECOVERY: 'retries',
};

function TodayCard({ data }: { data: DashboardDto }) {
  const { session, goalMinutes, activeMinutes, goalMet } = data.today;
  const finished = session?.status === 'COMPLETED';
  const inProgress = session && !finished;
  const reasons = session
    ? (Object.entries(session.summary) as [SelectionReason, number][])
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];
  const pct = session && session.total > 0 ? Math.round((session.answeredCount / session.total) * 100) : 0;

  const title = finished ? 'Today’s session is done' : inProgress ? 'Continue today’s session' : 'Today’s session';
  const cta = finished ? 'Practice more' : inProgress ? 'Continue' : 'Start';
  const href = finished ? '/session?extra=1' : '/session';

  return (
    <Card className="relative overflow-hidden border-0 bg-brand p-7 text-white shadow-lift sm:p-9">
      <div aria-hidden className="absolute -right-10 -top-10 size-56 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-16 right-28 size-40 rounded-full bg-white/10" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-xl space-y-3">
          <Spark className="size-7 text-white/90" />
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
          {session && !finished ? (
            <>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-lg text-white/90">
                <span>
                  {session.total - session.answeredCount} left of {session.total}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" /> about {session.plannedMinutes} min
                </span>
              </p>
              {reasons.length > 0 && (
                <p className="text-base text-white/80">
                  Built from {reasons.map(([r, n]) => `${n} ${SHORT_REASON[r]}`).join(', ')}.
                </p>
              )}
              {session.answeredCount > 0 && (
                <div className="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Session progress">
                  <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </>
          ) : finished ? (
            <p className="text-lg text-white/90">Great work. You can still do another round if you feel like it.</p>
          ) : (
            <p className="text-lg text-white/90">A short session picked for you: reviews that are due, mistakes, and new items from your lessons.</p>
          )}
        </div>
        <Link
          href={href}
          className={buttonClass('secondary', 'lg', 'border-0 bg-white text-brand shadow-[0_4px_0_rgba(0,0,0,0.18)] hover:bg-white')}
        >
          {finished ? <RotateCw className="size-5" /> : <Play className="size-5" fill="currentColor" />} {cta}
        </Link>
      </div>
      <p className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-base font-semibold">
        {goalMet ? <Check className="size-4" strokeWidth={3} /> : <Target className="size-4" />}
        {goalMet ? 'Daily goal reached' : `${Math.min(activeMinutes, goalMinutes)} of ${goalMinutes} min today`}
      </p>
    </Card>
  );
}

function StatCards({ data }: { data: DashboardDto }) {
  const { streak, xp } = data;
  const pct = xp.forLevel > 0 ? Math.min(100, Math.round((xp.intoLevel / xp.forLevel) * 100)) : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex items-center gap-4 p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-flame/15 text-flame">
          <Flame className="size-8" fill="currentColor" />
        </span>
        <div>
          <p className="font-heading text-3xl font-extrabold">
            {streak.current} day{streak.current === 1 ? '' : 's'}
          </p>
          <p className="text-base text-mute">
            {streak.current === 0 ? 'Finish a goal to start a streak' : 'streak'} · best {streak.longest}
          </p>
        </div>
      </Card>
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-xp/20 text-[#b88700]">
            <Star className="size-7" fill="currentColor" />
          </span>
          <div>
            <p className="font-heading text-3xl font-extrabold">Level {xp.level}</p>
            <p className="text-base text-mute">{xp.total} XP in total</p>
          </div>
        </div>
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
            <div className="h-full rounded-full bg-xp transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-semibold text-mute">
            {xp.intoLevel} / {xp.forLevel} XP to level {xp.level + 1}
          </p>
        </div>
      </Card>
    </div>
  );
}

function PracticeShortcuts({ data }: { data: DashboardDto }) {
  const open = data.mistakes.active + data.mistakes.improving;
  const due = data.reviews.dueCount;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
            <RotateCw className="size-6" />
          </span>
          <div>
            <p className="font-heading text-3xl font-extrabold">{due}</p>
            <p className="text-base text-mute">review{due === 1 ? '' : 's'} due</p>
          </div>
        </div>
        {due > 0 ? (
          <Link href="/practice/play?scope=due&count=10" className={buttonClass('secondary', 'md')}>
            Review now <ArrowRight className="size-5" />
          </Link>
        ) : (
          <p className="text-base text-mute">Nothing due. New reviews appear as you learn.</p>
        )}
      </Card>
      <Card className="flex flex-col justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bad-soft text-bad-edge">
            <Flag className="size-6" />
          </span>
          <div>
            <p className="font-heading text-3xl font-extrabold">{open}</p>
            <p className="text-base text-mute">open mistake{open === 1 ? '' : 's'}</p>
          </div>
        </div>
        {open > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/practice/play?scope=mistakes&count=10" className={buttonClass('secondary', 'md')}>
              Practice them
            </Link>
            <Link href="/mistakes" className={buttonClass('ghost', 'md')}>
              See all
            </Link>
          </div>
        ) : (
          <p className="text-base text-mute">No open mistakes. Keep it up!</p>
        )}
      </Card>
    </div>
  );
}

function WeakAreas({ data }: { data: DashboardDto }) {
  if (data.weakAreas.length === 0) return null;
  return (
    <section aria-labelledby="weak" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="weak" className="font-heading text-2xl font-extrabold tracking-tight">
          Needs more practice
        </h2>
        <Link href="/practice/play?scope=weak&count=10" className={buttonClass('ghost', 'sm')}>
          <Dumbbell className="size-4" /> Practice these
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.weakAreas.map((area) => (
          <li key={`${area.kind}-${area.label}`}>
            <Card className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{area.label}</p>
                  {area.labelFa && <p className="fa text-base text-mute">{area.labelFa}</p>}
                </div>
                <span className="rounded-full bg-bad-soft px-3 py-0.5 text-sm font-bold text-bad-edge">{area.count}</span>
              </div>
              {area.items.length > 0 && (
                <p className="flex flex-wrap gap-2">
                  {area.items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/library/${item.id}`}
                      className="rounded-full bg-subtle px-3 py-1 text-sm font-semibold hover:bg-brand-soft hover:text-brand"
                    >
                      {item.headword}
                    </Link>
                  ))}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Dashboard() {
  const dashboard = useDashboard();

  if (dashboard.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;
  if (dashboard.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
        {errorMessage(dashboard.error, 'We could not load your dashboard.')}
      </Card>
    );
  }

  const data = dashboard.data;
  // With nothing in the library there is nothing to build a session from yet.
  if (data.totals.items === 0) return <GettingStarted />;

  return (
    <div className="space-y-6">
      <TodayCard data={data} />
      <StatCards data={data} />
      <PracticeShortcuts data={data} />
      <CurrentFocus />
      <WeakAreas data={data} />
    </div>
  );
}
