import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { direction, translate } from '@/lib/i18n';
import { serverLocale } from '@/lib/i18n/server';
import { LocaleProvider } from '@/components/locale-provider';
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

/*
 * The ARABIC face. Geist has no Arabic glyphs, so without this an Arabic page
 * falls back to whatever the operating system has — Segoe UI on Windows, Geeza
 * Pro on a Mac, something else on Android — and the portal looks like three
 * products. IBM Plex Sans Arabic was drawn to sit beside a Latin grotesque at
 * the same weights, so English inside an Arabic sentence (a currency code, an
 * MT5 login, "OXShare") stays in Geist and still matches.
 *
 * It is listed AFTER Geist in `globals.css`: the browser takes Latin from Geist
 * and only the glyphs Geist lacks from here, so English pages are unchanged.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/** The tab title and description, in the visitor's language. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await serverLocale();
  return {
    title: translate(locale, 'meta.appTitle'),
    description: translate(locale, 'meta.appDescription'),
  };
}

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

  /*
   * The language, from the `oxshare-portal-locale` cookie — so `lang`, `dir`
   * and every string are right in the HTML itself. Same reason as the session
   * hint above: decided before the first byte rather than corrected a frame
   * after it, which for Arabic was a page of English that then flipped.
   */
  const locale = await serverLocale();

  return (
    <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
      {/*
        THE ONE SCROLL CAP.

        `h-dvh` + `overflow-hidden` on the body, so the DOCUMENT can never
        scroll. Every screen underneath owns its own scroll container — the
        portal's `<main>`, the auth shell, the full-screen states — and without
        this cap the document scrolls behind whichever of those is already
        scrolling, which the reader sees as two scrollbars side by side on the
        same screen.

        `dvh` rather than `vh`: on mobile `100vh` is the viewport with the
        browser chrome RETRACTED, so a `vh` cap is taller than what is actually
        visible and reintroduces the very overflow this removes.

        The consequence is a rule, not a preference: any screen whose content can
        exceed the viewport must carry its own `overflow-y-auto`, because
        anything past this box is now clipped rather than reachable by scrolling.
      */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} h-dvh overflow-hidden antialiased`}
      >
        {/* `defaultTheme` is NOT passed. It used to be `"light"` here, which
            overrode the provider's own default via the `{...props}` spread — so
            changing the default in theme-provider.tsx alone would have looked
            like it worked and changed nothing. The default is `"system"` and it
            lives in one place. */}
        <ThemeProvider storageKey="oxshare-portal-theme" nonce={nonce}>
          <LocaleProvider locale={locale}>
            <QueryProvider>
              <UserProvider initialSessionHint={sessionHint}>{children}</UserProvider>
            </QueryProvider>
            {/* INSIDE ThemeProvider — it reads `resolvedTheme` — but outside
              QueryProvider, which it does not use. It is not a provider and
              wraps nothing, so it takes no position in the tree beyond that. */}
            <Toaster />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
