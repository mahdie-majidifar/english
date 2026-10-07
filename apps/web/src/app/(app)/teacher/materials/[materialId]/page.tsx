import type { Metadata } from 'next';
import { MaterialPage } from '@/features/teacher/material-page';

export const metadata: Metadata = { title: 'Review material' };

export default function Page() {
  return <MaterialPage />;
}
