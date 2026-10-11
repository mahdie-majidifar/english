'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { applyTheme, effectiveTheme, readTheme, THEMES, type ThemeChoice } from '@/lib/theme';

/** The theme on the page, kept in step with changes made anywhere (the picker, the quick toggle). */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    setChoice(readTheme());
    const onChange = () => setChoice(readTheme());
    window.addEventListener('ec-theme', onChange);
    return () => window.removeEventListener('ec-theme', onChange);
  }, []);
  const set = (next: ThemeChoice) => {
    applyTheme(next);
    setChoice(next);
    window.dispatchEvent(new Event('ec-theme'));
  };
  return { choice, set };
}

/** One button that flips between light and dark (from the sidebar). */
export function ThemeToggle({ className }: { className?: string }) {
  const { choice, set } = useTheme();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(effectiveTheme(choice) === 'dark'), [choice]);
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => set(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn('grid size-10 place-items-center rounded-control text-mute transition-colors hover:bg-subtle hover:text-ink', className)}
    >
      <Icon className="size-5" />
    </button>
  );
}

const OPTIONS: Record<ThemeChoice, { label: string; hint: string; icon: typeof Sun }> = {
  system: { label: 'Same as my device', hint: 'Follows the setting of your phone or computer.', icon: Monitor },
  light: { label: 'Light', hint: 'Bright and warm.', icon: Sun },
  dark: { label: 'Dark', hint: 'Easier on the eyes at night.', icon: Moon },
};

/** The three choices, for the profile page. */
export function ThemePicker() {
  const { choice, set } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const { label, hint, icon: Icon } = OPTIONS[t];
        const selected = choice === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => set(t)}
            className={cn(
              'rounded-card border-2 p-5 text-left transition-colors',
              selected ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:border-brand/40',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-3 font-heading text-xl font-extrabold tracking-tight">
                <Icon className="size-5 text-brand" /> {label}
              </span>
              {selected && (
                <span className="grid size-6 place-items-center rounded-full bg-brand text-white">
                  <Check className="size-4" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="mt-2 block text-base text-mute">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
