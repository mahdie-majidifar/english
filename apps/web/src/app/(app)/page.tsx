import type { Metadata } from 'next';
import { Greeting } from '@/features/dashboard/greeting';
import { Dashboard } from '@/features/dashboard/dashboard';

export const metadata: Metadata = { title: 'Home' };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Greeting />
      <Dashboard />
    </div>
  );
}
