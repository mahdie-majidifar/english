import {
  BookOpen,
  ChartLine,
  Dumbbell,
  GraduationCap,
  House,
  Library,
  NotebookPen,
  Trophy,
  User,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pages ship phase by phase; items for later phases are shown but not clickable. */
  enabled: boolean;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: House, enabled: true, mobile: true },
  { href: '/practice', label: 'Practice', icon: Dumbbell, enabled: true, mobile: true },
  { href: '/library', label: 'Library', icon: Library, enabled: true, mobile: true },
  { href: '/books', label: 'Books', icon: BookOpen, enabled: true, mobile: true },
  { href: '/teacher', label: 'Teacher notes', icon: NotebookPen, enabled: true },
  { href: '/assessments', label: 'Quizzes & Exams', icon: GraduationCap, enabled: false },
  { href: '/progress', label: 'Progress', icon: ChartLine, enabled: false, mobile: true },
  { href: '/achievements', label: 'Achievements', icon: Trophy, enabled: false },
  { href: '/profile', label: 'Profile', icon: User, enabled: false },
];
