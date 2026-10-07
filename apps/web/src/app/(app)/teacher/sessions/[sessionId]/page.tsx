import type { Metadata } from 'next';
import { SessionDetailPage } from '@/features/teacher/session-detail-page';

export const metadata: Metadata = { title: 'Class session' };

export default function Page() {
  return <SessionDetailPage />;
}
