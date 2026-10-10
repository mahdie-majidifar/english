'use client';

import { ArrowDown, ArrowUp, ChevronDown, Clock, Flame, Minus, Star, Target, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { PROGRESS_RANGES, type BookProgress, type ItemGroupProgress, type ProgressDto, type WeekStat } from '@coach/contracts';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { ActivityChart } from './activity-chart';
import { useProgress } from './hooks';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);

function Tile({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint?: string; tone: string }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="font-heading text-2xl font-extrabold leading-tight">{value}</p>
        <p className="text-sm text-mute">{label}</p>
        {hint && <p className="text-xs text-mute/80">{hint}</p>}
      </div>
    </Card>
  );
}

/** A bar for "met" and "mastered" over all the items in a group. */
function GroupBar({ group, label }: { group: ItemGroupProgress; label: string }) {
  const seen = group.items === 0 ? 0 : (group.seen / group.items) * 100;
  const mastered = group.items === 0 ? 0 : (group.mastered / group.items) * 100;
  return (
    <div
      className="relative h-3 overflow-hidden rounded-full bg-subtle"
      role="img"
      aria-label={`${label}: ${group.seen} of ${group.items} practised, ${group.mastered} mastered`}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-brand/40" style={{ width: `${seen}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-good" style={{ width: `${mastered}%` }} />
    </div>
  );
}

function Delta({ now, before, unit = '' }: { now: number; before: number; unit?: string }) {
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', diff > 0 ? 'text-good-edge' : diff < 0 ? 'text-bad-edge' : 'text-mute')}>
      <Icon className="size-3.5" strokeWidth={3} />
      {diff === 0 ? 'same' : `${Math.abs(diff)}${unit}`}
    </span>
  );
}

function Week({ week }: { week: ProgressDto['week'] }) {
  const rows: { label: string; now: number | string; before: number | string; a: number; b: number; unit?: string }[] = [
    { label: 'Minutes', now: week.thisWeek.minutes, before: week.lastWeek.minutes, a: week.thisWeek.minutes, b: week.lastWeek.minutes },
    { label: 'Days practised', now: week.thisWeek.activeDays, before: week.lastWeek.activeDays, a: week.thisWeek.activeDays, b: week.lastWeek.activeDays },
    { label: 'XP', now: week.thisWeek.xp, before: week.lastWeek.xp, a: week.thisWeek.xp, b: week.lastWeek.xp },
    { label: 'New items', now: week.thisWeek.newItems, before: week.lastWeek.newItems, a: week.thisWeek.newItems, b: week.lastWeek.newItems },
    {
      label: 'Accuracy',
      now: pct(week.thisWeek.accuracy),
      before: pct(week.lastWeek.accuracy),
      a: Math.round((week.thisWeek.accuracy ?? 0) * 100),
      b: Math.round((week.lastWeek.accuracy ?? 0) * 100),
      unit: ' pts',
    },
  ];
  const empty = (w: WeekStat) => w.attempts === 0;

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-heading text-xl font-extrabold tracking-tight">This week and last week</h2>
        <p className="fa text-sm text-mute">مقایسه‌ی ۷ روز اخیر با ۷ روز قبل از آن.</p>
      </div>
      {empty(week.thisWeek) && empty(week.lastWeek) ? (
        <p className="rounded-2xl bg-subtle px-4 py-3 text-base text-mute">Nothing practised in the last two weeks yet.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-mute">
              <th scope="col" className="pb-2 font-semibold" />
              <th scope="col" className="pb-2 font-semibold">This week</th>
              <th scope="col" className="pb-2 font-semibold">Last week</th>
              <th scope="col" className="pb-2 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <th scope="row" className="py-2.5 text-base font-semibold">{r.label}</th>
                <td className="py-2.5 font-heading text-lg font-extrabold">{r.now}</td>
                <td className="py-2.5 text-base text-mute">{r.before}</td>
                <td className="py-2.5">
                  <Delta now={r.a} before={r.b} unit={r.unit} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const STATUS = [
  { key: 'mastered', label: 'Mastered', color: 'bg-good' },
  { key: 'review', label: 'Reviewing', color: 'bg-brand' },
  { key: 'learning', label: 'Learning', color: 'bg-flame' },
  { key: 'new', label: 'Not started', color: 'bg-line' },
] as const;

function Statuses({ statuses }: { statuses: ProgressDto['statuses'] }) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-heading text-xl font-extrabold tracking-tight">What you know</h2>
        <p className="fa text-sm text-mute">همه‌ی آیتم‌هایت بر اساس میزان یادگیری.</p>
      </div>
      {statuses.total === 0 ? (
        <p className="rounded-2xl bg-subtle px-4 py-3 text-base text-mute">Your library is empty. Add items to see this.</p>
      ) : (
        <>
          <div
            className="flex h-4 overflow-hidden rounded-full bg-subtle"
            role="img"
            aria-label={STATUS.map((s) => `${statuses[s.key]} ${s.label.toLowerCase()}`).join(', ')}
          >
            {STATUS.map((s) => (
              <div key={s.key} className={s.color} style={{ width: `${(statuses[s.key] / statuses.total) * 100}%` }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {STATUS.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <i aria-hidden className={cn('size-3 rounded-sm', s.color)} />
                <span className="text-sm text-mute">{s.label}</span>
                <span className="ml-auto font-heading text-lg font-extrabold">{statuses[s.key]}</span>
              </li>
            ))}
          </ul>
          {statuses.weak > 0 && (
            <p className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bad-soft/70 px-4 py-3 text-base">
              <span>
                <b>{statuses.weak}</b> item{statuses.weak === 1 ? '' : 's'} you often miss
              </span>
              <Link href="/practice/play?scope=weak&count=10" className={buttonClass('secondary', 'sm')}>
                Practice them
              </Link>
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Types({ types }: { types: ProgressDto['types'] }) {
  if (types.length === 0) return null;
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-heading text-xl font-extrabold tracking-tight">By kind of language</h2>
        <p className="fa text-sm text-mute">لغت، گرامر، collocation و … هرکدام چقدر جلو رفته‌اند.</p>
      </div>
      <ul className="space-y-4">
        {types.map((t) => (
          <li key={t.type} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold">{t.label}</span>
              <span className="text-sm text-mute">
                {t.seen}/{t.items} practised · {t.mastered} mastered
              </span>
            </div>
            <GroupBar group={t} label={t.label} />
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-mute">
        <span className="inline-flex items-center gap-2"><i aria-hidden className="size-3 rounded-sm bg-brand/40" /> Practised</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden className="size-3 rounded-sm bg-good" /> Mastered</span>
      </p>
    </Card>
  );
}

function Book({ book }: { book: BookProgress }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <ChevronDown className={cn('size-5 shrink-0 text-mute transition-transform', !open && '-rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-lg font-extrabold tracking-tight">{book.title}</span>
          <span className="text-sm text-mute">
            {book.items === 0 ? 'No items yet' : `${book.seen} of ${book.items} practised · ${book.mastered} mastered`}
          </span>
        </span>
        <span className="font-heading text-xl font-extrabold text-brand">{Math.round(book.avgMastery * 100)}%</span>
      </button>
      <div className="mt-3">
        <GroupBar group={book} label={book.title} />
      </div>
      {open && (
        <ul className="mt-4 space-y-3 border-t border-line pt-4">
          {book.units.filter((u) => u.items > 0).length === 0 ? (
            <li className="text-sm text-mute">None of the units has items yet.</li>
          ) : (
            book.units
              .filter((u) => u.items > 0)
              .map((u) => (
                <li key={u.unitId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold">
                      Unit {u.number}
                      {u.title && <span className="font-normal text-mute"> · {u.title}</span>}
                    </span>
                    <span className="text-sm text-mute">
                      {u.seen}/{u.items} · {Math.round(u.avgMastery * 100)}%
                    </span>
                  </div>
                  <GroupBar group={u} label={`Unit ${u.number}`} />
                </li>
              ))
          )}
        </ul>
      )}
    </li>
  );
}

export function ProgressPage() {
  const [days, setDays] = useState<number>(30);
  const query = useProgress(days);
  const p = query.data;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Progress</h1>
          <p className="mt-2 text-lg text-mute">How much you practise, and how much sticks.</p>
          <p className="fa mt-0.5 text-sm text-mute">پیشرفت تو: چقدر تمرین می‌کنی و چقدر یاد می‌گیری.</p>
        </div>
        <div role="radiogroup" aria-label="Time range" className="flex items-center gap-2 rounded-control bg-subtle p-1.5">
          {PROGRESS_RANGES.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={days === n}
              onClick={() => setDays(n)}
              className={cn('rounded-xl px-4 py-2 text-base font-semibold transition-colors', days === n ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink')}
            >
              {n} days
            </button>
          ))}
        </div>
      </header>

      {query.isPending ? (
        <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />
      ) : query.isError || !p ? (
        <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
          {errorMessage(query.error, 'We could not load your progress.')}
        </Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={<Clock className="size-6" />} tone="bg-brand-soft text-brand" label={`practised in ${p.days} days`} value={`${p.totals.activeMinutes} min`} hint={`${p.totals.activeDays} active day${p.totals.activeDays === 1 ? '' : 's'}`} />
            <Tile icon={<Target className="size-6" />} tone="bg-good-soft text-good-edge" label="of your answers were right" value={pct(p.totals.accuracy)} hint={`${p.totals.attempts} answers`} />
            <Tile icon={<Flame className="size-6" fill="currentColor" />} tone="bg-flame/15 text-flame" label="day streak" value={String(p.streak.current)} hint={`best ${p.streak.longest}`} />
            <Tile icon={<Star className="size-6" fill="currentColor" />} tone="bg-xp/20 text-[#b88700]" label={`level ${p.level.level}`} value={`${p.level.total} XP`} hint={`${p.level.intoLevel}/${p.level.forLevel} to next level`} />
          </section>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-xl font-extrabold tracking-tight">Every day</h2>
              <span className="text-sm text-mute">{p.totals.sessions} session{p.totals.sessions === 1 ? '' : 's'} finished</span>
            </div>
            <ActivityChart daily={p.daily} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Week week={p.week} />
            <Statuses statuses={p.statuses} />
          </div>

          <Types types={p.types} />

          <section aria-labelledby="books" className="space-y-3">
            <h2 id="books" className="font-heading text-2xl font-extrabold tracking-tight">
              Your books
            </h2>
            {p.books.length === 0 ? (
              <Card className="border-dashed py-8 text-center text-lg text-mute">
                No books yet. <Link href="/books" className="font-semibold text-brand underline">Add one</Link> to see your progress through it.
              </Card>
            ) : (
              <ul className="space-y-3">
                {p.books.map((b) => (
                  <Book key={b.bookId} book={b} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="tests" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="tests" className="font-heading text-2xl font-extrabold tracking-tight">
                Quizzes and exams
              </h2>
              <Link href="/achievements" className={buttonClass('secondary', 'sm')}>
                <Trophy className="size-4" /> Achievements
              </Link>
            </div>
            {p.recentAssessments.length === 0 ? (
              <Card className="border-dashed py-8 text-center text-lg text-mute">
                None yet. <Link href="/assessments" className="font-semibold text-brand underline">Take a quiz</Link> to test what you know.
              </Card>
            ) : (
              <>
                <p className="text-base text-mute">
                  In {p.days} days: {p.totals.quizzes} quiz{p.totals.quizzes === 1 ? '' : 'zes'}
                  {p.totals.avgQuizScore !== null && ` (average ${pct(p.totals.avgQuizScore)})`}, {p.totals.exams} exam{p.totals.exams === 1 ? '' : 's'}
                  {p.totals.avgExamScore !== null && ` (average ${pct(p.totals.avgExamScore)})`}.
                </p>
                <ul className="grid gap-3 xl:grid-cols-2">
                  {p.recentAssessments.map((a) => (
                    <li key={a.id}>
                      <Link href={`/assessments/${a.id}`} className="block focus-visible:outline-offset-4">
                        <Card interactive className="flex items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-heading text-lg font-bold">{a.title}</p>
                            <p className="text-sm text-mute">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(a.gradedAt))}</p>
                          </div>
                          <span className={cn('rounded-full px-3 py-1 font-heading text-base font-extrabold', a.score >= 0.8 ? 'bg-good-soft text-good-edge' : a.score >= 0.5 ? 'bg-brand-soft text-brand' : 'bg-bad-soft text-bad-edge')}>
                            {pct(a.score)}
                          </span>
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
