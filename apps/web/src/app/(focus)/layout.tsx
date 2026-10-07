import type { ReactNode } from 'react';
import { FocusGate } from '@/components/app-shell/focus-gate';

/** Focus screens (practice, later quizzes and exams): signed-in only, no sidebar, nothing to distract. */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <FocusGate>{children}</FocusGate>;
}