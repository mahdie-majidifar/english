import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginArt } from '@/features/auth/login-art';
import { RegisterForm } from '@/features/auth/register-form';
import { BrandMark } from '@/components/ui/spark';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <LoginArt />

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="font-heading text-xl font-extrabold tracking-tight">English Coach</span>
          </div>

          <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight">Create your account</h1>
          <p className="mt-3 text-lg text-mute">Your own coach, your own notes, your own progress.</p>
          <p className="fa mb-8 mt-1 text-base text-mute">با ایمیل و رمز عبور حساب بساز. اطلاعاتت فقط برای خودته.</p>

          <RegisterForm />

          <p className="mt-8 text-center text-base text-mute">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
