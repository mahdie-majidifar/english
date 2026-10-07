import type { Metadata } from 'next';
import { MistakesPage } from '@/features/mistakes/mistakes-page';

export const metadata: Metadata = { title: 'My mistakes' };

export default function Page() {
  return <MistakesPage />;
}
