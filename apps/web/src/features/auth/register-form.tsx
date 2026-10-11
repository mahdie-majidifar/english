'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RegisterRequestSchema } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useRegister } from './use-auth';

type Errors = Partial<Record<'displayName' | 'email' | 'password', string>>;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'There is already an account with this email. Try signing in instead.';
    if (error.status === 403) return 'Sign-ups are closed right now.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a minute and try again.';
    if (error.status === 0 || error.status >= 500) return 'We could not reach the server. Please try again in a moment.';
  }
  return 'Something went wrong. Please try again.';
}

export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();
  const [errors, setErrors] = useState<Errors>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = RegisterRequestSchema.safeParse({
      displayName: String(form.get('displayName') ?? ''),
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'displayName' || key === 'email' || key === 'password') {
          next[key] ??= key === 'email' ? 'Enter a valid email address.' : issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    register.mutate(parsed.data, { onSuccess: () => router.replace('/') });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field label="Your name" name="displayName" autoComplete="name" placeholder="Sara" error={errors.displayName} autoFocus />
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        hint="At least 8 characters, with a letter and a number."
      />

      {register.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {messageFor(register.error)}
        </p>
      )}

      <Button type="submit" size="lg" loading={register.isPending} className="w-full">
        Create account
      </Button>
    </form>
  );
}
