import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { DEFAULT_LOCALE, direction } from '@/lib/i18n';
import { LocaleDirection } from '@/components/locale-direction';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

import { UserProvider } from '@/context/UserContext';
import { SESSION_HINT_COOKIE } from '@/lib/session-hint';
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

/**
 * `async`, and it reads `headers()`, for ONE reason: the CSP nonce.
 *
 * `next-themes` injects an inline script to set the theme class before first
 * paint — that is what stops the flash of the wrong theme. Next stamps its OWN
 * inline scripts with the nonce automatically, but not a library's, so with
 * `'unsafe-inline'` removed that one script is blocked and every page loads in
 * the default theme with a console error nobody sees.
 *
 * The cost is that this layout renders dynamically rather than being
 * prerendered. That is acceptable here and would not be everywhere: every route
 * in this app is behind a session and personalised anyway, so there was nothing
 * to cache.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  /*
   * "Has this browser been signed in?" — answered BEFORE the first byte of HTML.
   *
   * Read here rather than in the component that needs it, because the component
   * that needs it (`RedirectIfAuthenticated`) is a client component: reading
   * `document.cookie` there renders `false` on the server and `true` after
   * hydration, so the sign-in form ships in the HTML and is swapped out a frame
   * later. Reading it server-side means the very first paint is already right.
   *
   * It costs nothing extra: this layout is already dynamic for the CSP nonce
   * above, so there is no cached render for `cookies()` to opt out of.
   *
   * It is a HINT and never an authorisation — see lib/session-hint.ts. Nothing
   * private is rendered from it; it only decides whether to show a spinner or a
   * sign-in form while `/auth/me` is in flight.
   */
  const sessionHint = (await cookies()).has(SESSION_HINT_COOKIE);

  return (
    <html lang={DEFAULT_LOCALE} dir={direction(DEFAULT_LOCALE)} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* `defaultTheme` is NOT passed. It used to be `"light"` here, which
            overrode the provider's own default via the `{...props}` spread — so
            changing the default in theme-provider.tsx alone would have looked
            like it worked and changed nothing. The default is `"system"` and it
            lives in one place. */}
        <ThemeProvider storageKey="oxshare-portal-theme" nonce={nonce}>
          <LocaleDirection />
          <QueryProvider>
            <UserProvider initialSessionHint={sessionHint}>{children}</UserProvider>
          </QueryProvider>
          {/* INSIDE ThemeProvider — it reads `resolvedTheme` — but outside
              QueryProvider, which it does not use. It is not a provider and
              wraps nothing, so it takes no position in the tree beyond that. */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
