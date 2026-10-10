'use client';

import { Library, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
import { ITEM_TYPES, ITEM_TYPE_META, type ItemType } from '@coach/contracts';
import { buttonClass, Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField } from '@/components/ui/field';
import { MODES } from '@/components/ui/skill-chip';
import { cn } from '@/lib/cn';
import { useDebounced } from '@/lib/use-debounced';
import { useBook, useBooks } from '@/features/catalog/hooks';
import { useItems } from '@/features/content/hooks';
import { ItemCard } from './item-card';
import { TYPE_ORDER } from './type-ui';

function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawType = params.get('type');
  const type = (ITEM_TYPES as readonly string[]).includes(rawType ?? '') ? (rawType as ItemType) : undefined;
  const filters = {
    type,
    q: params.get('q') ?? '',
    bookId: params.get('book') ?? undefined,
    lessonId: params.get('lesson') ?? undefined,
  };

  function set(patch: Partial<Record<'type' | 'q' | 'book' | 'lesson', string | undefined>>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  return { filters, set };
}

export function LibraryPage() {
  const { filters, set } = useUrlFilters();
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search);

  // Typing updates the URL after a short pause; the URL is the single source of truth for filters.
  useEffect(() => {
    if (debounced !== filters.q) set({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const books = useBooks();
  const book = useBook(filters.bookId);
  const items = useItems({
    type: filters.type,
    q: filters.q || undefined,
    bookId: filters.lessonId ? undefined : filters.bookId,
    lessonId: filters.lessonId,
  });

  const counts = items.data?.pages[0]?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const list = items.data?.pages.flatMap((p) => p.items) ?? [];
  const isFiltered = Boolean(filters.q || filters.bookId || filters.lessonId);
  const addHref = `/library/new${filters.type ? `?type=${filters.type}` : ''}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Library</h1>
          <p className="mt-2 text-lg text-mute">Everything you have learned, in one place.</p>
        </div>
        <Link href={addHref} className={buttonClass('primary', 'md')}>
          <Plus className="size-5" /> Add item
        </Link>
      </header>

      <div className="space-y-4">
        <label className="relative block">
          <span className="sr-only">Search your library</span>
          <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-mute" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search words, meanings, grammar…"
            className="h-14 w-full rounded-control border border-line bg-card pl-12 pr-4 text-lg outline-none transition-[border-color,box-shadow] placeholder:text-mute/70 focus:border-brand focus:shadow-[0_0_0_4px_var(--brand-soft)]"
          />
        </label>

        <div role="tablist" aria-label="Item type" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            role="tab"
            aria-selected={!filters.type}
            onClick={() => set({ type: undefined })}
            className={cn(
              'shrink-0 rounded-full border px-4 py-2 text-base font-semibold transition-colors',
              !filters.type ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink hover:bg-subtle',
            )}
          >
            All <span className="ml-1 opacity-70">{total}</span>
          </button>
          {TYPE_ORDER.map((type) => {
            const meta = ITEM_TYPE_META[type];
            const selected = filters.type === type;
            return (
              <button
                key={type}
                role="tab"
                aria-selected={selected}
                onClick={() => set({ type })}
                style={{ '--mode': MODES[meta.mode].color } as CSSProperties}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-base font-semibold transition-colors',
                  selected
                    ? 'border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_14%,white)] text-[var(--mode)]'
                    : 'border-line bg-card text-ink hover:bg-subtle',
                )}
              >
                <i aria-hidden className="size-2 rounded-full bg-[var(--mode)]" />
                {meta.plural}
                <span className="opacity-70">{counts[type] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {books.data && books.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Book"
              value={filters.bookId ?? ''}
              onChange={(e) => set({ book: e.target.value || undefined, lesson: undefined })}
            >
              <option value="">All books</option>
              {books.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Lesson"
              value={filters.lessonId ?? ''}
              disabled={!filters.bookId || !book.data}
              onChange={(e) => set({ lesson: e.target.value || undefined })}
            >
              <option value="">All lessons</option>
              {book.data?.units.flatMap((u) =>
                u.lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.title}
                  </option>
                )),
              )}
            </SelectField>
          </div>
        )}
      </div>

      {items.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-card bg-subtle" />
          ))}
        </div>
      )}

      {items.isError && (
        <Card role="alert" className="border-bad/40 bg-bad-soft">
          <p className="text-lg font-semibold text-bad-edge">We could not load your library.</p>
          <Button variant="secondary" className="mt-4" onClick={() => items.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {items.data && list.length === 0 && (
        <Card className="grid place-items-center gap-4 border-dashed py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Library className="size-8" />
          </span>
          {isFiltered || filters.type ? (
            <>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight">Nothing matches</h2>
              <p className="max-w-md text-lg text-mute">Try a different search or clear the filters.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  set({ type: undefined, q: undefined, book: undefined, lesson: undefined });
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight">Your library is empty</h2>
              <p className="max-w-md text-lg text-mute">
                Add the first word or grammar point from your class. Soon you will be able to paste your
                teacher&apos;s notes and let the coach do this for you.
              </p>
              <Link href={addHref} className={buttonClass('primary', 'lg')}>
                <Plus className="size-5" /> Add your first item
              </Link>
            </>
          )}
        </Card>
      )}

      {list.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          {items.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={items.isFetchingNextPage} onClick={() => items.fetchNextPage()}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
