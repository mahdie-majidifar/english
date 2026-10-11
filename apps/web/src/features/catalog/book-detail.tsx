'use client';

import { ArrowLeft, ChevronDown, ClipboardPaste, Dumbbell, GraduationCap, Plus, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isPlaceholderLessonTitle, type BookDetail, type ImportStructureResult, type LessonDto, type UnitDto } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextareaField } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';
import { BossButton } from '@/features/assessments/boss-button';
import { QuizButton } from '@/features/assessments/quiz-button';
import { FillWithAiDialog } from '@/features/learn/fill-with-ai-dialog';
import {
  useBook,
  useCreateLesson,
  useCreateUnit,
  useDeleteBook,
  useDeleteLesson,
  useDeleteUnit,
  useImportStructure,
  useSetCurrentLesson,
} from './hooks';

const EXAMPLE = `Unit 8: Money
8A Shopping
8B Business
8C Spending habits`;

function ImportDialog({ bookId, open, onClose }: { bookId: string; open: boolean; onClose: () => void }) {
  const importer = useImportStructure(bookId);
  const [result, setResult] = useState<ImportStructureResult | null>(null);

  function close() {
    setResult(null);
    importer.reset();
    onClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('text') ?? '').trim();
    if (text) importer.mutate(text, { onSuccess: setResult });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Paste the table of contents"
      description="One lesson per line, like “8B Business”. Lines starting with “Unit 8” set the unit title."
    >
      {result ? (
        <div className="space-y-5">
          <p className="rounded-control bg-good-soft px-4 py-3 text-base font-medium text-good-ink">
            Added {result.lessonsCreated} lesson{result.lessonsCreated === 1 ? '' : 's'} and {result.unitsCreated} unit
            {result.unitsCreated === 1 ? '' : 's'}.
            {result.lessonsRenamed > 0 && ` Named ${result.lessonsRenamed} lesson${result.lessonsRenamed === 1 ? '' : 's'}.`}
            {result.lessonsSkipped > 0 && ` ${result.lessonsSkipped} already existed.`}
          </p>
          {result.rejected.length > 0 && (
            <div className="rounded-control bg-bad-soft px-4 py-3 text-base text-bad-ink">
              <p className="mb-1 font-semibold">These lines were not understood:</p>
              <ul className="list-disc pl-5">
                {result.rejected.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <TextareaField
            label="Lessons"
            name="text"
            rows={8}
            placeholder={EXAMPLE}
            hint="Re-pasting is safe: lessons that already exist are skipped."
            className="font-mono text-base"
            autoFocus
          />
          {importer.isError && (
            <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
              {errorMessage(importer.error)}
            </p>
          )}
          <Button type="submit" size="lg" loading={importer.isPending} className="w-full">
            Add lessons
          </Button>
        </form>
      )}
    </Dialog>
  );
}

function AddUnitDialog({ bookId, open, onClose }: { bookId: string; open: boolean; onClose: () => void }) {
  const create = useCreateUnit(bookId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = Number(form.get('number'));
    if (!Number.isInteger(number)) return;
    create.mutate({ number, title: String(form.get('title') ?? '').trim() || null }, { onSuccess: onClose });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a unit">
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Unit number" name="number" type="number" min={0} max={99} required autoFocus />
        <Field label="Title (optional)" name="title" placeholder="Money" />
        {create.isError && (
          <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
            {errorMessage(create.error)}
          </p>
        )}
        <Button type="submit" size="lg" loading={create.isPending} className="w-full">
          Add unit
        </Button>
      </form>
    </Dialog>
  );
}

function AddLessonForm({ unitId, onDone }: { unitId: string; onDone: () => void }) {
  const create = useCreateLesson(unitId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate(
      { code: String(form.get('code') ?? '').trim(), title: String(form.get('title') ?? '').trim() },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl bg-subtle p-4">
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
        <Field label="Code" name="code" placeholder="8B" maxLength={8} required autoFocus />
        <Field label="Lesson title" name="title" placeholder="Business" required />
      </div>
      {create.isError && (
        <p role="alert" className="text-base font-medium text-bad-ink">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" size="sm" loading={create.isPending}>
          Add lesson
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LessonRow({ lesson, unitTitle }: { lesson: LessonDto; unitTitle: string | null }) {
  const setCurrent = useSetCurrentLesson();
  const remove = useDeleteLesson();
  const [confirming, setConfirming] = useState(false);
  const [filling, setFilling] = useState(false);
  const empty = lesson.itemCount === 0;

  return (
    <li
      className={`rounded-2xl border px-4 py-3 transition-colors ${
        lesson.isCurrent ? 'border-brand/40 bg-brand-soft' : 'border-line bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 min-w-12 place-items-center rounded-xl bg-subtle px-2 font-heading text-lg font-extrabold">
          {lesson.code}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{lesson.title}</p>
          <p className="text-sm text-mute">
            {empty ? 'No items yet' : `${lesson.itemCount} item${lesson.itemCount === 1 ? '' : 's'}`}
          </p>
        </div>
        {lesson.isCurrent && (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            <i aria-hidden className="size-2 animate-pulse rounded-full bg-white" /> Current lesson
          </span>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete lesson ${lesson.code}`}
          className="grid size-9 place-items-center rounded-control text-mute transition-colors hover:bg-bad-soft hover:text-bad-ink"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <Link href={`/learn?lessonId=${lesson.id}`} className={buttonClass('secondary', 'sm')}>
          <GraduationCap className="size-4" /> Learn
        </Link>
        <Link href={`/practice/play?scope=lesson&lessonId=${lesson.id}&count=10`} className={buttonClass('secondary', 'sm')}>
          <Dumbbell className="size-4" /> Practice
        </Link>
        <QuizButton lessonId={lesson.id} />
        {empty && (
          <Button variant="secondary" size="sm" onClick={() => setFilling(true)}>
            <Sparkles className="size-4" /> Fill with AI
          </Button>
        )}
        {!lesson.isCurrent && (
          <Button variant="ghost" size="sm" loading={setCurrent.isPending} onClick={() => setCurrent.mutate(lesson.id)}>
            Set as current
          </Button>
        )}
      </div>

      <FillWithAiDialog
        open={filling}
        onClose={() => setFilling(false)}
        lessonId={lesson.id}
        lessonName={`${lesson.code} · ${lesson.title}`}
        needsTopic={isPlaceholderLessonTitle(lesson.title) && !unitTitle}
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(lesson.id, { onSuccess: () => setConfirming(false) })}
        loading={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        title={`Delete lesson ${lesson.code}?`}
        description="The words and grammar you added stay in your library; they just lose the link to this lesson."
        confirmLabel="Delete lesson"
      />
    </li>
  );
}

function UnitCard({ unit, defaultOpen }: { unit: UnitDto; defaultOpen: boolean }) {
  const remove = useDeleteUnit();
  const [open, setOpen] = useState(defaultOpen);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const items = unit.lessons.reduce((n, l) => n + l.itemCount, 0);
  const current = unit.lessons.some((l) => l.isCurrent);

  return (
    <Card className={current ? 'border-brand/40' : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown className={`size-5 shrink-0 text-mute transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="min-w-0">
            <span className="block truncate font-heading text-xl font-extrabold tracking-tight">
              Unit {unit.number}
              {unit.title && <span className="text-mute"> · {unit.title}</span>}
            </span>
            <span className="text-sm text-mute">
              {unit.lessons.length} lesson{unit.lessons.length === 1 ? '' : 's'} ·{' '}
              {items === 0 ? 'no items yet' : `${items} item${items === 1 ? '' : 's'}`}
              {current ? ' · you are here' : ''}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/practice/play?scope=unit&unitId=${unit.id}&count=15`} className={buttonClass('secondary', 'sm')}>
            <Dumbbell className="size-4" /> Practice unit
          </Link>
          <QuizButton unitId={unit.id} />
          {items >= 5 && <BossButton unitId={unit.id} />}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete unit ${unit.number}`}
            className="grid size-9 place-items-center rounded-control text-mute transition-colors hover:bg-bad-soft hover:text-bad-ink"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4">
          {unit.lessons.length === 0 ? (
            <p className="rounded-2xl bg-subtle px-4 py-3 text-base text-mute">No lessons in this unit yet.</p>
          ) : (
            <ul className="space-y-2">
              {unit.lessons.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} unitTitle={unit.title} />
              ))}
            </ul>
          )}

          {adding ? (
            <AddLessonForm unitId={unit.id} onDone={() => setAdding(false)} />
          ) : (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add lesson
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(unit.id, { onSuccess: () => setConfirming(false) })}
        loading={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        title={`Delete unit ${unit.number}?`}
        description="Its lessons are deleted too. Your words and grammar stay in the library."
        confirmLabel="Delete unit"
      />
    </Card>
  );
}

function BookHeader({ book }: { book: BookDetail }) {
  const router = useRouter();
  const remove = useDeleteBook();
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);

  return (
    <header className="space-y-5">
      <Link href="/books" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> All books
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {book.cefr && (
              <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">{book.cefr}</span>
            )}
            <span className="rounded-full bg-subtle px-3 py-1 text-sm font-semibold text-mute">
              {book.itemCount} item{book.itemCount === 1 ? '' : 's'}
            </span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">{book.title}</h1>
          <p className="mt-1 text-lg text-mute">{book.series}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <ClipboardPaste className="size-5" /> Paste contents
          </Button>
          <Button variant="secondary" onClick={() => setAddingUnit(true)}>
            <Plus className="size-5" /> Add unit
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(true)} aria-label="Delete book">
            <Trash2 className="size-5" />
          </Button>
        </div>
      </div>

      <ImportDialog bookId={book.id} open={importing} onClose={() => setImporting(false)} />
      <AddUnitDialog bookId={book.id} open={addingUnit} onClose={() => setAddingUnit(false)} />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(book.id, { onSuccess: () => router.replace('/books') })}
        loading={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        title={`Delete “${book.title}”?`}
        description="Its units and lessons are deleted. Your words and grammar stay in your library."
        confirmLabel="Delete book"
      />
    </header>
  );
}

export function BookDetailPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const book = useBook(bookId);

  if (book.isPending) {
    return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;
  }
  if (book.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft">
        <p className="text-lg font-semibold text-bad-ink">{errorMessage(book.error, 'We could not load this book.')}</p>
        <Link href="/books" className="mt-3 inline-block font-semibold underline">
          Back to your books
        </Link>
      </Card>
    );
  }

  const data = book.data;
  return (
    <div className="space-y-8">
      <BookHeader book={data} />

      {data.units.length === 0 ? (
        <Card className="grid place-items-center gap-4 border-dashed py-14 text-center">
          <ClipboardPaste className="size-10 text-brand" />
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Add the units and lessons</h2>
          <p className="max-w-lg text-lg text-mute">
            Paste the table of contents from your book. One lesson per line works best:
          </p>
          <pre className="rounded-2xl bg-subtle px-6 py-4 text-left font-mono text-base">{EXAMPLE}</pre>
        </Card>
      ) : (
        <div className="space-y-5">
          {data.units.map((unit) => (
            <UnitCard key={unit.id} unit={unit} defaultOpen={data.units.length <= 10 || unit.lessons.some((l) => l.isCurrent)} />
          ))}
        </div>
      )}
    </div>
  );
}
