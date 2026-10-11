'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { errorMessage } from '@/lib/errors';
import { useItem } from '@/features/content/hooks';
import { ItemForm } from './item-form';

export function ItemEditPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const query = useItem(itemId);

  return (
    <div className="space-y-6">
      <Link
        href={`/library/${itemId}`}
        className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-heading text-4xl font-extrabold tracking-tight">Edit item</h1>

      {query.isPending && <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />}
      {query.isError && (
        <Card role="alert" className="border-bad/40 bg-bad-soft">
          <p className="text-lg font-semibold text-bad-ink">{errorMessage(query.error, 'We could not load this item.')}</p>
        </Card>
      )}
      {query.data && <ItemForm item={query.data} />}
    </div>
  );
}
