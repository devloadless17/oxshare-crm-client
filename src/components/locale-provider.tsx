'use client';

import { setActiveLocale, type Locale } from '@/lib/i18n';

/**
 * Makes the locale the SERVER resolved (the `oxshare-portal-locale` cookie, read
 * in `app/layout.tsx`) the one every `t()` below it uses.
 *
 * Set DURING render, deliberately, rather than in an effect: the first render
 * has to be in the right language — on the server, so the HTML is Arabic, and on
 * the client, so hydration finds the same text. An effect runs after both, which
 * is a page of English followed by a flip to Arabic.
 *
 * Idempotent: on the client the module already read the same cookie when it
 * loaded, so this assigns the value it holds. It wraps rather than sits beside
 * the tree so the assignment happens before any child renders.
 *
 * It replaced `LocaleDirection`, which corrected `<html lang dir>` after
 * hydration: the root layout now renders both from the cookie.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  setActiveLocale(locale);
  return children;
}
