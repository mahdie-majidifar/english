import type { Metadata } from 'next';
import { ResultPage } from '@/features/assessments/result-page';

export const metadata: Metadata = { title: 'Result' };

export default function Page() {
  return <ResultPage />;
}
