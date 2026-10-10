import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LearnPage } from '@/features/learn/learn-page';

export const metadata: Metadata = { title: 'Learn' };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />}>
      <LearnPage />
    </Suspense>
  );
}
