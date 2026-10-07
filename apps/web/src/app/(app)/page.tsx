import type { Metadata } from 'next';
import { Greeting } from '@/features/dashboard/greeting';
import { GettingStarted } from '@/features/dashboard/getting-started';

export const metadata: Metadata = { title: 'Home' };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Greeting />
      <GettingStarted />
    </div>
  );
}
