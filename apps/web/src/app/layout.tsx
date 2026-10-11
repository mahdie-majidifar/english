import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Vazirmatn } from 'next/font/google';
import { cookies } from 'next/headers';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['500', '600', '700', '800'],
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: { default: 'English Coach', template: '%s · English Coach' },
  description: 'Your personal English coach: practice what you learned today.',
  applicationName: 'English Coach',
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'English Coach', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F5' },
    { media: '(prefers-color-scheme: dark)', color: '#12121C' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every page is rendered per request (reading the cookie makes it so): the Content-Security-Policy carries a
  // fresh nonce (see proxy.ts) that Next can only put on the scripts while rendering, never in a page built ahead
  // of time. The same cookie holds the light/dark choice, so the page is drawn in the right theme from the first byte.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme === 'system' ? undefined : theme} className={`${jakarta.variable} ${inter.variable} ${vazirmatn.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
