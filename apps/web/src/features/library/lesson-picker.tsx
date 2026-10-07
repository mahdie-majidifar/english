'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { useBook, useBooks, useCurrent } from '@/features/catalog/hooks';

interface LessonPickerProps {
  value: string[];
  onChange: (lessonIds: string[]) => void;
}

/**
 * Choose where an item was met. Pick a book, then toggle its lessons.
 * Lessons already chosen in other books are kept untouched.
 */
export function LessonPicker({ value, onChange }: LessonPickerProps) {
  const books = useBooks();
  const current = useCurrent();
  const [chosenBook, setChosenBook] = useState<string | null>(null);

  const bookId = chosenBook ?? current.data?.book.id ?? books.data?.[0]?.id;
  const book = useBook(bookId);

  if (books.data?.length === 0) {
    return (
      <p className="rounded-control bg-subtle px-4 py-3 text-base text-mute">
        Add a book first if you want to link this to a lesson. You can also save it without one.
      </p>
    );
  }

  const inThisBook = new Set(book.data?.units.flatMap((u) => u.lessons.map((l) => l.id)) ?? []);
  const elsewhere = value.filter((id) => !inThisBook.has(id)).length;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="space-y-4">
      <SelectField
        label="Book"
        value={bookId ?? ''}
        onChange={(e) => setChosenBook(e.target.value)}
        disabled={!books.data}
      >
        {books.data?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
          </option>
        ))}
      </SelectField>

      {book.isPending && <div className="h-16 animate-pulse rounded-control bg-subtle" aria-busy />}

      {book.data && book.data.units.length === 0 && (
        <p className="text-base text-mute">This book has no lessons yet. Add them on the Books page.</p>
      )}

      {book.data?.units.map((unit) => (
        <fieldset key={unit.id}>
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">
            Unit {unit.number}
            {unit.title ? ` · ${unit.title}` : ''}
          </legend>
          <div className="flex flex-wrap gap-2">
            {unit.lessons.map((lesson) => {
              const on = value.includes(lesson.id);
              return (
                <button
                  key={lesson.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(lesson.id)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-base font-semibold transition-colors',
                    on
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-card text-ink hover:border-brand/40 hover:bg-brand-soft',
                  )}
                >
                  {lesson.code} · {lesson.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {elsewhere > 0 && (
        <p className="text-sm text-mute">
          Also linked to {elsewhere} lesson{elsewhere === 1 ? '' : 's'} in other books.
        </p>
      )}
    </div>
  );
}
