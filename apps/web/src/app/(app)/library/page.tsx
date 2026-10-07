import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LibraryPage } from '@/features/library/library-page';

export const metadata: Metadata = { title: 'Library' };

export default function Page() {
  // The page reads filters from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />}>
      <LibraryPage />
    </Suspense>
  );
}
