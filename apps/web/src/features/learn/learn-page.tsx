'use client';

import { ArrowLeft, ArrowRight, Dumbbell, Lightbulb, ListChecks, PartyPopper, Plus, RotateCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ITEM_TYPE_META, type Explanation, type Item } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkillChip } from '@/components/ui/skill-chip';
import { SpeakButton } from '@/components/ui/speak-button';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { QuizButton } from '@/features/assessments/quiz-button';
import { useItems } from '@/features/content/hooks';
import { TypeDetails } from '@/features/library/item-detail';
import { FillWithAiDialog } from './fill-with-ai-dialog';
import { useExplain, useExplanation, useLearnContext } from './hooks';

function ExplanationView({ explanation }: { explanation: Explanation }) {
  return (
    <div className="space-y-5">
      <p className="fa text-lg leading-loose">{explanation.overviewFa}</p>

      {explanation.keyPoints.length > 0 && (
        <ul className="fa space-y-1.5 pr-5 text-base">
          {explanation.keyPoints.map((p) => (
            <li key={p} className="list-disc">
              {p}
            </li>
          ))}
        </ul>
      )}

      {explanation.examples.length > 0 && (
        <ul className="space-y-2">
          {explanation.examples.map((e) => (
            <li key={e.en} className="rounded-2xl bg-subtle px-4 py-3">
              <p className="text-lg">{e.en}</p>
              <p className="fa text-base text-mute">{e.fa}</p>
            </li>
          ))}
        </ul>
      )}

      {explanation.commonMistakes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-mute">Common mistakes</p>
          <ul className="space-y-2">
            {explanation.commonMistakes.map((m) => (
              <li key={m.wrong} className="rounded-2xl bg-bad-soft/60 px-4 py-3">
                <p className="text-base">
                  <span className="text-bad-edge line-through">{m.wrong}</span> <span className="text-mute">→</span>{' '}
                  <span className="font-semibold text-good-edge">{m.right}</span>
                </p>
                {m.noteFa && <p className="fa text-base text-mute">{m.noteFa}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A mini-lesson in Persian, written by the AI when asked and then kept. */
function ExplainPanel({ itemId }: { itemId: string }) {
  const saved = useExplanation(itemId);
  const explain = useExplain(itemId);

  return (
    <Card className="space-y-4 border-brand/20 bg-brand-soft/40">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Lightbulb className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg font-extrabold tracking-tight">Explain it to me</h3>
          <p className="fa text-sm text-mute">توضیح کوتاه به فارسی، با مثال و اشتباه‌های رایج.</p>
        </div>
        {saved.data && (
          <button
            type="button"
            onClick={() => explain.mutate(true)}
            disabled={explain.isPending}
            aria-label="Write it again"
            title="Write it again"
            className="grid size-9 place-items-center rounded-control text-mute hover:bg-white hover:text-ink"
          >
            <RotateCw className={cn('size-4', explain.isPending && 'animate-spin')} />
          </button>
        )}
      </div>

      {saved.data ? (
        <ExplanationView explanation={saved.data} />
      ) : (
        <Button variant="secondary" loading={explain.isPending || saved.isPending} onClick={() => explain.mutate(false)}>
          <Sparkles className="size-5" /> Explain with AI
        </Button>
      )}

      {explain.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
          {errorMessage(explain.error)}
        </p>
      )}
    </Card>
  );
}

function ItemCard({ item }: { item: Item }) {
  const meta = ITEM_TYPE_META[item.type];
  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-6 sm:p-8">
        <SkillChip mode={meta.mode} label={meta.label} />
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">{item.headword}</h2>
          <SpeakButton text={item.headword} withSlow />
        </div>
        {item.meaningEn && <p className="text-xl text-ink">{item.meaningEn}</p>}
        {item.meaningFa && <p className="fa text-xl text-mute">{item.meaningFa}</p>}
        {!item.meaningEn && !item.meaningFa && <p className="text-base text-mute">No meaning saved yet.</p>}
      </Card>
      <TypeDetails item={item} />
      <ExplainPanel itemId={item.id} />
    </div>
  );
}

function Empty({ lessonId, title, needsTopic }: { lessonId: string | null; title: string; needsTopic: boolean }) {
  const [filling, setFilling] = useState(false);
  return (
    <Card className="grid place-items-center gap-4 border-dashed py-14 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Lightbulb className="size-7" />
      </span>
      <h2 className="font-heading text-2xl font-extrabold tracking-tight">Nothing to learn here yet</h2>
      <p className="max-w-md text-lg text-mute">
        {title} has no words or grammar yet. Add your teacher’s notes, add items yourself, or let the AI suggest a starting list.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {lessonId && (
          <Button onClick={() => setFilling(true)}>
            <Sparkles className="size-5" /> Fill with AI
          </Button>
        )}
        <Link href="/teacher/new" className={buttonClass('secondary', 'md')}>
          Add teacher notes
        </Link>
        <Link href="/library/new" className={buttonClass('secondary', 'md')}>
          <Plus className="size-5" /> Add an item
        </Link>
      </div>
      {lessonId && <FillWithAiDialog open={filling} onClose={() => setFilling(false)} lessonId={lessonId} lessonName={title} needsTopic={needsTopic} />}
    </Card>
  );
}

export function LearnPage() {
  const search = useSearchParams();
  const lessonId = search.get('lessonId') ?? undefined;
  const unitId = search.get('unitId') ?? undefined;
  const context = useLearnContext({ lessonId, unitId });
  const items = useItems({ lessonId, unitId });
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  // The list comes newest first and in pages: take every page, and teach in the order things were added.
  useEffect(() => {
    if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
  }, [items]);
  const list = useMemo(() => (items.data?.pages.flatMap((p) => p.items) ?? []).toReversed(), [items.data]);
  const loading = items.isPending || items.hasNextPage;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length]);

  if (context.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft">
        <p className="text-lg font-semibold text-bad-edge">{errorMessage(context.error, 'We could not open this.')}</p>
        <Link href="/books" className="mt-3 inline-block font-semibold underline">
          Back to your books
        </Link>
      </Card>
    );
  }
  if (context.isPending || loading) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;

  const ctx = context.data;
  const practiceHref = ctx.lessonId
    ? `/practice/play?scope=lesson&lessonId=${ctx.lessonId}&count=10`
    : `/practice/play?scope=unit&unitId=${ctx.unitId}&count=15`;
  const item = list[index];

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link href={`/books/${ctx.bookId}`} className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
          <ArrowLeft className="size-4" /> {ctx.subtitle}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-mute">Learn</p>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{ctx.title}</h1>
            <p className="fa mt-0.5 text-sm text-mute">اول یاد بگیر، بعد تمرین کن.</p>
          </div>
          {list.length > 0 && (
            <div className="flex flex-wrap items-start gap-2">
              <Link href={practiceHref} className={buttonClass('secondary', 'sm')}>
                <Dumbbell className="size-4" /> Practice
              </Link>
              {ctx.lessonId ? <QuizButton lessonId={ctx.lessonId} /> : <QuizButton unitId={ctx.unitId} />}
            </div>
          )}
        </div>
      </header>

      {list.length === 0 ? (
        <Empty lessonId={ctx.lessonId} title={ctx.title} needsTopic={ctx.needsTopic} />
      ) : done ? (
        <Card className="grid place-items-center gap-4 py-14 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-good-soft text-good-edge">
            <PartyPopper className="size-8" />
          </span>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight">You went through all {list.length}</h2>
          <p className="max-w-md text-lg text-mute">Now practise them, so they stay in your memory.</p>
          <div className="flex flex-wrap items-start justify-center gap-3">
            <Link href={practiceHref} className={buttonClass('primary', 'lg')}>
              <Dumbbell className="size-5" /> Practice now
            </Link>
            {ctx.lessonId ? <QuizButton lessonId={ctx.lessonId} /> : <QuizButton unitId={ctx.unitId} />}
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                setIndex(0);
                setDone(false);
              }}
            >
              <ListChecks className="size-5" /> Go through again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-semibold text-mute">
              <span>
                {index + 1} of {list.length}
              </span>
              <span className="hidden sm:inline">Use ← → to move</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-subtle"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={list.length}
              aria-valuenow={index + 1}
              aria-label="Progress through the lesson"
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${((index + 1) / list.length) * 100}%` }} />
            </div>
          </div>

          {item && <ItemCard key={item.id} item={item} />}

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="lg" onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0}>
              <ArrowLeft className="size-5" /> Previous
            </Button>
            {index < list.length - 1 ? (
              <Button size="lg" onClick={() => setIndex((i) => i + 1)}>
                Next <ArrowRight className="size-5" />
              </Button>
            ) : (
              <Button size="lg" variant="good" onClick={() => setDone(true)}>
                Finish
              </Button>
            )}
          </div>

          <nav aria-label="Jump to an item" className="flex flex-wrap gap-2 border-t border-line pt-5">
            {list.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'true' : undefined}
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-semibold transition-colors',
                  i === index ? 'bg-brand text-white' : 'bg-subtle text-mute hover:bg-brand-soft hover:text-brand',
                )}
              >
                {it.headword}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
