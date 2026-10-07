import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Vazirmatn } from 'next/font/google';
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
};

export const viewport: Viewport = {
  themeColor: '#FAF8F5',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable} ${vazirmatn.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
