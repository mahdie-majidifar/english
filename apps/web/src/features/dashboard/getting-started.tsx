'use client';

import { ArrowRight, BookOpen, Check, Dumbbell, NotebookPen, Plus } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spark } from '@/components/ui/spark';
import { cn } from '@/lib/cn';
import { useCurrent } from '@/features/catalog/hooks';
import { useSessions } from '@/features/teacher/hooks';

/** Current book, unit and lesson: the anchor for everything the coach will build. */
export function CurrentFocus() {
  const { data: current, isPending } = useCurrent();
  if (isPending) return <div className="h-40 animate-pulse rounded-card bg-subtle" aria-busy />;

  if (!current) {
    return (
      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-vocab/10 text-vocab">
            <BookOpen className="size-7" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-extrabold tracking-tight">Choose your book</h2>
            <p className="mt-1 text-base text-mute">Tell the coach which book and lesson you are on.</p>
          </div>
        </div>
        <Link href="/books" className={buttonClass('primary', 'md')}>
          Go to books <ArrowRight className="size-5" />
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-mute">Studying now</p>
          <h2 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">
            {current.lesson.code} · {current.lesson.title}
          </h2>
          <p className="mt-1 text-lg text-mute">
            {current.book.title} · Unit {current.unit.number}
            {current.unit.title ? `: ${current.unit.title}` : ''}
          </p>
        </div>
        <div className="rounded-2xl bg-brand-soft px-5 py-3 text-center">
          <p className="font-heading text-3xl font-extrabold text-brand">{current.itemCount}</p>
          <p className="text-sm font-semibold text-mute">in this lesson</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {current.itemCount > 0 && (
          <Link href="/practice/play?scope=current&count=10" className={buttonClass('primary', 'md')}>
            <Dumbbell className="size-5" /> Practice this lesson
          </Link>
        )}
        <Link href="/library/new" className={buttonClass(current.itemCount > 0 ? 'secondary' : 'primary', 'md')}>
          <Plus className="size-5" /> Add item
        </Link>
        <Link href={`/books/${current.book.id}`} className={buttonClass('secondary', 'md')}>
          Open book
        </Link>
        <Link href={`/library?book=${current.book.id}&lesson=${current.lesson.id}`} className={buttonClass('ghost', 'md')}>
          View lesson items
        </Link>
      </div>
    </Card>
  );
}

const STEPS = [
  { icon: BookOpen, title: 'Choose your book', body: 'Pick the book and lesson you are studying.', color: 'text-vocab bg-vocab/10' },
  {
    icon: NotebookPen,
    title: 'Add your teacher notes',
    body: 'Paste or upload what your teacher covered. The coach turns it into practice.',
    color: 'text-grammar bg-grammar/10',
  },
  {
    icon: Dumbbell,
    title: 'Start your first session',
    body: 'A personal 10-minute session, built from your own notes and mistakes.',
    color: 'text-colloc bg-colloc/10',
  },
] as const;

/** What a new learner sees until there is something to practise. */
export function GettingStarted() {
  const { data: current } = useCurrent();
  const { data: sessions } = useSessions();
  const hasNotes = Boolean(sessions?.some((s) => s.itemCount > 0));
  const done = [Boolean(current), hasNotes, false];
  const links = ['/books', '/teacher/new', '/session'];

  return (
    <section aria-labelledby="getting-started" className="space-y-5">
      <CurrentFocus />

      <Card className="relative overflow-hidden border-0 bg-brand p-8 text-white shadow-lift sm:p-10">
        <div aria-hidden className="absolute -right-10 -top-10 size-56 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-24 size-40 rounded-full bg-white/10" />
        <Spark className="mb-4 size-8 text-white/90" />
        <h2 id="getting-started" className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
          Your coach is getting ready.
        </h2>
        <p className="mt-3 max-w-xl text-lg text-white/85">
          Your daily session appears here once the coach has something to build it from. Three
          steps to get there:
        </p>
      </Card>

      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const isDone = done[i];
          const href = links[i];
          return (
            <li key={step.title}>
              <Card className="h-full">
                <div className="mb-4 flex items-center gap-3">
                  <span className={cn('grid size-12 place-items-center rounded-2xl', step.color)}>
                    <step.icon className="size-6" />
                  </span>
                  <span className="font-heading text-sm font-bold uppercase tracking-wider text-mute">Step {i + 1}</span>
                </div>
                <h3 className="font-heading text-xl font-bold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-mute">{step.body}</p>
                {isDone ? (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good-edge">
                    <Check className="size-4" strokeWidth={3} /> Done
                  </p>
                ) : href ? (
                  <Link href={href} className={buttonClass('secondary', 'sm', 'mt-4')}>
                    {i === 0 ? 'Choose a book' : i === 1 ? 'Add notes' : 'Start session'} <ArrowRight className="size-4" />
                  </Link>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
