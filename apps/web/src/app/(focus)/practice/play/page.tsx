import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlayPage } from '@/features/practice/play-page';

export const metadata: Metadata = { title: 'Practice' };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy />}>
      <PlayPage />
    </Suspense>
  );
}
