'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { AuthUser } from '@coach/contracts';
import { Spark } from '@/components/ui/spark';
import { useMe } from '@/features/auth/use-auth';
import { ApiError } from '@/lib/api';

/**
 * Renders its children only for a signed-in learner. Restores the session (the API client refreshes
 * it silently), and sends the learner to the sign-in page when that is not possible.
 */
export function AuthGate({ children }: { children: (user: AuthUser) => ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      router.replace(`/login${pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''}`);
    }
  }, [me.error, pathname, router]);

  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spark className="size-12 animate-spin text-brand [animation-duration:1.4s]" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-heading text-2xl font-bold">We could not load your account.</p>
          <p className="mt-2 text-mute">Check that the API is running, then reload the page.</p>
        </div>
      </div>
    );
  }
  return <>{children(me.data.user)}</>;
}
