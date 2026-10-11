'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LoginRequestSchema } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useLogin } from './use-auth';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') return 'That email or password is not right. Please try again.';
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a minute and try again.';
    if (error.status === 0 || error.status >= 500) return 'We could not reach the server. Please try again in a moment.';
  }
  return 'Something went wrong. Please try again.';
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const login = useLogin();
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = LoginRequestSchema.safeParse({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    });
    if (!parsed.success) {
      const errors: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'password' ? 'password' : 'email';
        errors[key] ??= key === 'email' ? 'Enter a valid email address.' : 'Enter your password.';
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    login.mutate(parsed.data, { onSuccess: () => router.replace(next) });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={fieldErrors.email}
        autoFocus
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.password}
      />

      {login.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {messageFor(login.error)}
        </p>
      )}

      <Button type="submit" size="lg" loading={login.isPending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
