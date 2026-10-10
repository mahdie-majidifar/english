import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/login-form';
import { LoginArt } from '@/features/auth/login-art';
import { SignupLink } from '@/features/auth/signup-link';
import { BrandMark } from '@/components/ui/spark';

export const metadata: Metadata = { title: 'Sign in' };

/** Only allow same-site relative redirects. */
function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <LoginArt />

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="font-heading text-xl font-extrabold tracking-tight">English Coach</span>
          </div>

          <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight">
            Welcome back.
          </h1>
          <p className="mt-3 text-lg text-mute">Sign in to continue your practice.</p>
          <p className="fa mb-8 mt-1 text-base text-mute">برای ادامه‌ی تمرین وارد شو.</p>

          <LoginForm next={safeNext(next)} />
          <SignupLink />
        </div>
      </section>
    </main>
  );
}
