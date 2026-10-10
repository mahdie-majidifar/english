import type { Metadata } from 'next';
import { TakePage } from '@/features/assessments/take-page';

export const metadata: Metadata = { title: 'Quiz or exam' };

export default function Page() {
  return <TakePage />;
}
