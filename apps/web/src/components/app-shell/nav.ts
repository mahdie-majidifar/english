import {
  BookOpen,
  ChartLine,
  Dumbbell,
  Flag,
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
  /** A few Persian words, shown on hover. */
  hintFa: string;
  icon: LucideIcon;
  /** Pages ship phase by phase; items for later phases are shown but not clickable. */
  enabled: boolean;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Grouped by what the learner is doing: studying, practising, testing, or looking after their own things. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Today',
    items: [{ href: '/', label: 'Home', hintFa: 'خانه و جلسه‌ی امروز', icon: House, enabled: true, mobile: true }],
  },
  {
    label: 'Study',
    items: [
      { href: '/books', label: 'Books', hintFa: 'کتاب‌ها، یونیت‌ها و درس‌ها', icon: BookOpen, enabled: true, mobile: true },
      { href: '/teacher', label: 'Teacher notes', hintFa: 'یادداشت‌های کلاس', icon: NotebookPen, enabled: true },
      { href: '/library', label: 'Library', hintFa: 'همه‌ی لغت‌ها و گرامرهای تو', icon: Library, enabled: true, mobile: true },
    ],
  },
  {
    label: 'Practice',
    items: [
      { href: '/practice', label: 'Practice', hintFa: 'تمرین', icon: Dumbbell, enabled: true, mobile: true },
      { href: '/mistakes', label: 'My mistakes', hintFa: 'اشتباه‌های من', icon: Flag, enabled: true },
      { href: '/assessments', label: 'Quizzes & Exams', hintFa: 'آزمون و امتحان', icon: GraduationCap, enabled: true, mobile: true },
    ],
  },
  {
    label: 'You',
    items: [
      { href: '/progress', label: 'Progress', hintFa: 'پیشرفت', icon: ChartLine, enabled: false },
      { href: '/achievements', label: 'Achievements', hintFa: 'دستاوردها', icon: Trophy, enabled: false },
      { href: '/profile', label: 'Profile & settings', hintFa: 'پروفایل و تنظیمات', icon: User, enabled: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
