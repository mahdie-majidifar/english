'use client';

import Link from 'next/link';
import { useSystemStatus } from './use-auth';

/** Shown under the sign-in form, unless sign-ups were switched off on the server. */
export function SignupLink() {
  const { data } = useSystemStatus();
  if (data && !data.registrationOpen) return null;
  return (
    <p className="mt-8 text-center text-base text-mute">
      New here?{' '}
      <Link href="/register" className="font-semibold text-brand hover:underline">
        Create an account
      </Link>
    </p>
  );
}
