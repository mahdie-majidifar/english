import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SessionPage } from '@/features/session/session-page';

export const metadata: Metadata = { title: 'Today’s session' };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy />}>
      <SessionPage />
    </Suspense>
  );
}
