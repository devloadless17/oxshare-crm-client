import 'server-only';
import { cookies, headers } from 'next/headers';
import type { Metadata } from 'next';
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from './index';
import { LOCALE_COOKIE, parseLocale } from './locale-storage';
import { localeFromAcceptLanguage } from './browser-language';

/**
 * The request's language, for SERVER code: the root layout, `generateMetadata`,
 * server components.
 *
 * Server code must not use `t()`. `t()` reads the module's active locale, which
 * `<LocaleProvider>` sets for the CLIENT tree; a server component or a metadata
 * function runs outside that provider and, with concurrent requests, could read
 * another visitor's language. These take the locale explicitly instead.
 */
export async function serverLocale(): Promise<Locale> {
  // A language the visitor CHOSE (the switch, or an emailed link) wins; until
  // they choose, the one their phone asks for (browser-language.ts).
  return (
    parseLocale((await cookies()).get(LOCALE_COOKIE)?.value) ??
    localeFromAcceptLanguage((await headers()).get('accept-language')) ??
    DEFAULT_LOCALE
  );
}

/** `{ title: 'Wallet — OXShare' }` in the request's language, for a section layout. */
export async function pageMetadata(page: MessageKey): Promise<Metadata> {
  const locale = await serverLocale();
  return { title: translate(locale, 'meta.pageTitle', { page: translate(locale, page) }) };
}
