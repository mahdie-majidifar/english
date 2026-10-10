import type { Metadata } from 'next';
import { AssessmentsPage } from '@/features/assessments/assessments-page';

export const metadata: Metadata = { title: 'Quizzes & Exams' };

export default function Page() {
  return <AssessmentsPage />;
}
