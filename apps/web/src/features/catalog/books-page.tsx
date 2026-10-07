'use client';

import { BookOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CEFR_LEVELS, CreateBookSchema, type BookSummary } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';
import { useBooks, useCreateBook } from './hooks';

const COVERS = [
  'from-vocab to-grammar',
  'from-colloc to-grammar',
  'from-expr to-formation',
  'from-formation to-expr',
  'from-verbs to-colloc',
];

function BookCard({ book, index }: { book: BookSummary; index: number }) {
  return (
    <Link href={`/books/${book.id}`} className="group block focus-visible:outline-offset-4">
      <Card interactive className="flex h-full flex-col gap-5 p-5">
        <div
          aria-hidden
          className={`relative grid h-36 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${COVERS[index % COVERS.length]}`}
        >
          <div className="absolute -right-6 -top-6 size-28 rounded-full bg-white/20" />
          <div className="absolute -bottom-8 left-4 size-24 rounded-full bg-white/15" />
          <BookOpen className="relative size-12 text-white/90" strokeWidth={1.75} />
        </div>

        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {book.cefr && (
              <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">{book.cefr}</span>
            )}
            {book.isCurrent && (
              <span className="inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good-edge">
                <i aria-hidden className="size-2 animate-pulse rounded-full bg-good" />
                Studying now
              </span>
            )}
          </div>
          <h2 className="font-heading text-xl font-extrabold leading-snug tracking-tight">{book.title}</h2>
          <p className="mt-1 text-base text-mute">{book.series}</p>
        </div>

        <dl className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
          {[
            ['Units', book.unitCount],
            ['Lessons', book.lessonCount],
            ['Items', book.itemCount],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-mute">{label}</dt>
              <dd className="font-heading text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </Link>
  );
}

function AddBookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateBook();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const series = String(form.get('series') ?? '').trim();
    const level = String(form.get('level') ?? '').trim();
    const cefr = String(form.get('cefr') ?? '');
    const typedTitle = String(form.get('title') ?? '').trim();
    const parsed = CreateBookSchema.safeParse({
      series,
      title: typedTitle || (level ? `${series} ${level}` : ''),
      levelNumber: level ? Number(level) : null,
      cefr: cefr || null,
    });
    if (!parsed.success) {
      setErrors({ title: 'Give the book a title, or enter its level number.' });
      return;
    }
    setErrors({});
    create.mutate(parsed.data, { onSuccess: onClose });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a book"
      description="Any book works. American English File 4 and 5 are added the same way."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Series" name="series" defaultValue="American English File" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Level number" name="level" type="number" min={0} max={20} placeholder="3" />
          <SelectField label="CEFR level" name="cefr" defaultValue="">
            <option value="">Not set</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </SelectField>
        </div>
        <Field
          label="Title"
          name="title"
          placeholder="American English File 3"
          hint="Leave empty to use the series and level number."
          error={errors.title}
        />
        {create.isError && (
          <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
            {errorMessage(create.error)}
          </p>
        )}
        <Button type="submit" size="lg" loading={create.isPending} className="w-full">
          Add book
        </Button>
      </form>
    </Dialog>
  );
}

export function BooksPage() {
  const books = useBooks();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Your books</h1>
          <p className="mt-2 text-lg text-mute">Pick the book you are studying. Your coach follows your lesson.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-5" /> Add book
        </Button>
      </header>

      {books.isPending && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-card bg-subtle" />
          ))}
        </div>
      )}

      {books.isError && (
        <Card role="alert" className="border-bad/40 bg-bad-soft">
          <p className="text-lg font-semibold text-bad-edge">We could not load your books.</p>
          <Button variant="secondary" className="mt-4" onClick={() => books.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {books.data?.length === 0 && (
        <Card className="grid place-items-center gap-4 border-dashed py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
            <BookOpen className="size-8" />
          </span>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Add your first book</h2>
          <p className="max-w-md text-lg text-mute">
            Start with the book you study in class, for example American English File 3.
          </p>
          <Button size="lg" onClick={() => setAdding(true)}>
            <Plus className="size-5" /> Add book
          </Button>
        </Card>
      )}

      {books.data && books.data.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.data.map((book, i) => (
            <BookCard key={book.id} book={book} index={i} />
          ))}
        </div>
      )}

      <AddBookDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
