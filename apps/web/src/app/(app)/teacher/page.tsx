import type { Metadata } from 'next';
import { SessionsPage } from '@/features/teacher/sessions-page';

export const metadata: Metadata = { title: 'Teacher notes' };

export default function Page() {
  return <SessionsPage />;
}
