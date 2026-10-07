'use client';

import { useMe } from '@/features/auth/use-auth';

function partOfDay(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Greeting() {
  const { data } = useMe();
  const name = data?.user.displayName.split(' ')[0];
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: data?.user.timezone,
    }).format(new Date()),
  );

  return (
    <header>
      <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
        {partOfDay(hour)}
        {name ? `, ${name}` : ''}
      </h1>
      <p className="mt-3 text-lg text-mute">Ten focused minutes beat an hour of cramming.</p>
    </header>
  );
}
