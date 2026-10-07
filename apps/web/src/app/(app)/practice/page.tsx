import type { Metadata } from 'next';
import { PracticePage } from '@/features/practice/practice-page';

export const metadata: Metadata = { title: 'Practice' };

export default function Page() {
  return <PracticePage />;
}
