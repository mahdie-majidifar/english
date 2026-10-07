'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/field';
import { useBook, useBooks, useCurrent } from './hooks';

interface LessonSelectProps {
  value: string | null;
  onChange: (lessonId: string | null) => void;
  label?: string;
}

/** Pick one lesson: choose a book, then a lesson. Starts from what the learner is studying now. */
export function LessonSelect({ value, onChange, label = 'Lesson' }: LessonSelectProps) {
  const books = useBooks();
  const current = useCurrent();
  const [chosenBook, setChosenBook] = useState<string | null>(null);

  const bookId = chosenBook ?? current.data?.book.id ?? books.data?.[0]?.id;
  const book = useBook(bookId);

  if (books.data?.length === 0) {
    return <p className="rounded-control bg-subtle px-4 py-3 text-base text-mute">Add a book to link this to a lesson (optional).</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(books.data?.length ?? 0) > 1 && (
        <SelectField
          label="Book"
          value={bookId ?? ''}
          onChange={(e) => {
            setChosenBook(e.target.value);
            onChange(null);
          }}
        >
          {books.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField
        label={label}
        value={value ?? ''}
        disabled={!book.data}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">No lesson</option>
        {book.data?.units.map((unit) => (
          <optgroup key={unit.id} label={`Unit ${unit.number}${unit.title ? ` · ${unit.title}` : ''}`}>
            {unit.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.title}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>
    </div>
  );
}
