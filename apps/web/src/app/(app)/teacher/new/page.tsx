import type { Metadata } from 'next';
import { NewSessionPage } from '@/features/teacher/new-session-page';

export const metadata: Metadata = { title: 'New class session' };

export default function Page() {
  return <NewSessionPage />;
}
