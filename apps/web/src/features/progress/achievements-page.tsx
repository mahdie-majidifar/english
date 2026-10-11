'use client';

import { Check } from 'lucide-react';
import { AchievementMedal, NewAchievements } from '@/components/ui/achievement-badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useAchievements } from './hooks';

const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

export function AchievementsPage() {
  const query = useAchievements();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Achievements</h1>
          <p className="mt-2 text-lg text-mute">Small goals that mark how far you have come.</p>
          <p className="fa mt-0.5 text-sm text-mute">دستاوردها؛ هدف‌های کوچکی که پیشرفتت را نشان می‌دهند.</p>
        </div>
        {query.data && (
          <p className="rounded-full bg-brand-soft px-4 py-2 font-heading text-lg font-extrabold text-brand">
            {query.data.unlocked} of {query.data.total}
          </p>
        )}
      </header>

      {query.isPending ? (
        <div className="h-72 animate-pulse rounded-card bg-subtle" aria-busy />
      ) : query.isError ? (
        <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-ink">
          {errorMessage(query.error)}
        </Card>
      ) : (
        <>
          <NewAchievements badges={query.data.newlyUnlocked} />
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.achievements.map((a) => {
              const earned = a.unlockedAt !== null;
              const pct = Math.round((a.progress / a.target) * 100);
              return (
                <li key={a.code}>
                  <Card className={cn('flex h-full gap-4 p-5', !earned && 'bg-card/60')}>
                    <AchievementMedal icon={a.icon} earned={earned} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={cn('font-heading text-lg font-extrabold leading-tight', !earned && 'text-mute')}>{a.title}</p>
                      <p className="text-sm text-mute">{a.description}</p>
                      {earned ? (
                        <p className="inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-good-ink">
                          <Check className="size-4" strokeWidth={3} /> Earned {when(a.unlockedAt!)}
                        </p>
                      ) : (
                        <div className="pt-1.5">
                          <div className="h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${a.title} progress`}>
                            <div className="h-full rounded-full bg-brand/70" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-xs font-semibold text-mute">
                            {a.progress} / {a.target}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
