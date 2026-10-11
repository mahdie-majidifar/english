'use client';

import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { CEFR_LEVELS, DIFFICULTIES, DIFFICULTY_INFO, type Difficulty, type Profile } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, SelectField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { ThemePicker } from '@/components/ui/theme-controls';
import { useProfile, useUpdateProfile } from './hooks';

function DifficultyPicker({ value, onPick, saving }: { value: Difficulty; onPick: (d: Difficulty) => void; saving: boolean }) {
  return (
    <section aria-labelledby="difficulty" className="space-y-3">
      <div>
        <h2 id="difficulty" className="font-heading text-2xl font-extrabold tracking-tight">
          How hard should the exercises be?
        </h2>
        <p className="fa mt-0.5 text-sm text-mute">سطح سختی تمرین‌ها. هر وقت خواستی عوضش کن.</p>
      </div>
      <div role="radiogroup" aria-label="Difficulty" className="grid gap-3 xl:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const info = DIFFICULTY_INFO[d];
          const selected = value === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => onPick(d)}
              className={cn(
                'rounded-card border-2 p-5 text-left transition-colors',
                selected ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:border-brand/40',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-heading text-xl font-extrabold tracking-tight">{info.label}</span>
                {selected && (
                  <span className="grid size-6 place-items-center rounded-full bg-brand text-white">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-2 block text-base text-mute">{info.body}</span>
              <span className="fa mt-2 block text-sm text-mute">{info.bodyFa}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SettingsForm({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const level = String(form.get('englishLevel') ?? '');
    update.mutate(
      {
        displayName: String(form.get('displayName') ?? '').trim(),
        englishLevel: level ? (level as Profile['englishLevel']) : null,
        dailyGoalMinutes: Number(form.get('dailyGoalMinutes')),
        learningGoal: String(form.get('learningGoal') ?? '').trim() || null,
      },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="displayName" defaultValue={profile.displayName} required maxLength={60} />
        <SelectField label="Your English level" name="englishLevel" defaultValue={profile.englishLevel ?? ''}>
          <option value="">Not set</option>
          {CEFR_LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </SelectField>
        <Field
          label="Daily goal (minutes)"
          name="dailyGoalMinutes"
          type="number"
          min={5}
          max={180}
          defaultValue={profile.dailyGoalMinutes}
          hint="Finishing a session or reaching this keeps your streak."
        />
        <Field label="What do you want from English?" name="learningGoal" defaultValue={profile.learningGoal ?? ''} maxLength={300} placeholder="Speak better at work" />
      </div>
      {update.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {errorMessage(update.error)}
        </p>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" loading={update.isPending}>
          Save
        </Button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-2 text-base font-semibold text-good-ink">
            <Check className="size-4" strokeWidth={3} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

export function ProfilePage() {
  const profile = useProfile();
  const update = useUpdateProfile();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">Profile & settings</h1>
        <p className="mt-2 text-lg text-mute">Your goals and how the coach builds your practice.</p>
        <p className="fa mt-0.5 text-sm text-mute">اطلاعات و تنظیمات تمرین.</p>
      </header>

      {profile.isPending ? (
        <div className="h-72 animate-pulse rounded-card bg-subtle" aria-busy />
      ) : profile.isError ? (
        <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-ink">
          {errorMessage(profile.error)}
        </Card>
      ) : (
        <>
          <DifficultyPicker
            value={profile.data.difficulty}
            saving={update.isPending}
            onPick={(difficulty) => update.mutate({ difficulty })}
          />
          <section aria-labelledby="appearance" className="space-y-3">
            <div>
              <h2 id="appearance" className="font-heading text-2xl font-extrabold tracking-tight">
                Appearance
              </h2>
              <p className="fa mt-0.5 text-sm text-mute">روشن یا تیره. روی همین دستگاه ذخیره می‌شود.</p>
            </div>
            <ThemePicker />
          </section>
          <section aria-labelledby="about" className="space-y-3">
            <h2 id="about" className="font-heading text-2xl font-extrabold tracking-tight">
              About you
            </h2>
            <Card className="p-6">
              <SettingsForm profile={profile.data} />
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
