import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemNewPage } from '@/features/library/item-new';

export const metadata: Metadata = { title: 'Add item' };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />}>
      <ItemNewPage />
    </Suspense>
  );
}
