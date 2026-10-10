import { Award, BookOpen, Flag, Flame, Footprints, GraduationCap, Star, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { AchievementBadge, AchievementIcon } from '@coach/contracts';
import { cn } from '@/lib/cn';

const ICONS: Record<AchievementIcon, LucideIcon> = {
  footprints: Footprints,
  flame: Flame,
  star: Star,
  book: BookOpen,
  trophy: Trophy,
  target: Target,
  zap: Zap,
  flag: Flag,
  award: Award,
  graduation: GraduationCap,
};

const TONES: Record<AchievementIcon, string> = {
  footprints: 'bg-brand text-white',
  flame: 'bg-flame text-white',
  star: 'bg-xp text-white',
  book: 'bg-vocab text-white',
  trophy: 'bg-xp text-white',
  target: 'bg-colloc text-white',
  zap: 'bg-grammar text-white',
  flag: 'bg-bad text-white',
  award: 'bg-formation text-white',
  graduation: 'bg-brand text-white',
};

/** The round medal for an achievement. Grey until it is earned. */
export function AchievementMedal({ icon, earned = true, className }: { icon: AchievementIcon; earned?: boolean; className?: string }) {
  const Icon = ICONS[icon];
  return (
    <span
      aria-hidden
      className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', earned ? TONES[icon] : 'bg-subtle text-mute/60', className)}
    >
      <Icon className="size-7" />
    </span>
  );
}

/** "Achievement unlocked" strip shown when a session, quiz or exam has just earned something. */
export function NewAchievements({ badges }: { badges: AchievementBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <section aria-label="New achievements" className="space-y-3">
      <h2 className="text-center font-heading text-lg font-extrabold tracking-tight">
        {badges.length === 1 ? 'Achievement unlocked!' : `${badges.length} achievements unlocked!`}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {badges.map((b) => (
          <li
            key={b.code}
            className="flex animate-[pop-in_420ms_ease-out] items-center gap-4 rounded-card border border-xp/40 bg-xp/10 p-4"
          >
            <AchievementMedal icon={b.icon} />
            <div className="min-w-0">
              <p className="font-heading text-lg font-extrabold leading-tight">{b.title}</p>
              <p className="text-sm text-mute">{b.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
