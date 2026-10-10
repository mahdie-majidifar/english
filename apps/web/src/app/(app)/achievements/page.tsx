import type { Metadata } from 'next';
import { AchievementsPage } from '@/features/progress/achievements-page';

export const metadata: Metadata = { title: 'Achievements' };

export default function Page() {
  return <AchievementsPage />;
}
