'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ITEM_TYPES, type ItemType } from '@coach/contracts';
import { useCurrent } from '@/features/catalog/hooks';
import { ItemForm } from './item-form';

export function ItemNewPage() {
  const params = useSearchParams();
  const current = useCurrent();
  const raw = params.get('type');
  const type = (ITEM_TYPES as readonly string[]).includes(raw ?? '') ? (raw as ItemType) : 'VOCABULARY';

  // Wait for the current lesson so new items default to what the learner is studying now.
  if (current.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;

  return (
    <div className="space-y-6">
      <Link href="/library" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Library
      </Link>
      <div>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">Add to your library</h1>
        <p className="mt-2 text-lg text-mute">
          {current.data
            ? `New items are linked to ${current.data.lesson.code} · ${current.data.lesson.title}. You can change that below.`
            : 'Words, collocations, grammar and more.'}
        </p>
      </div>
      <ItemForm defaultType={type} defaultLessonIds={current.data ? [current.data.lesson.id] : []} />
    </div>
  );
}
