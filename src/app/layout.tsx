import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { DEFAULT_LOCALE, direction } from '@/lib/i18n';
import { LocaleDirection } from '@/components/locale-direction';
import { ThemeProvider } from '@/components/theme-provider';

import { UserProvider } from '@/context/UserContext';
import { QueryProvider } from '@/components/query-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OXShare Client Portal',
  description: 'OXShare client portal — trading accounts, wallet, and verification.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE} dir={direction(DEFAULT_LOCALE)} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider defaultTheme="light" storageKey="oxshare-portal-theme">
          <LocaleDirection />
          <QueryProvider>
            <UserProvider>{children}</UserProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
