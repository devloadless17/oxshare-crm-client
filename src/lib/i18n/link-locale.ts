import { parseLocale } from './locale-storage';
import type { Locale } from './index';

/**
 * `?lang=` — the language an EMAILED link carries (backend `EmailService`).
 *
 * The email was written in the client's language; the page it opens must be
 * too. The portal remembers a language per DEVICE (`locale-storage.ts`), so on a
 * phone that never chose one it opened in English: an Arabic welcome email
 * landing on an English page, for exactly the clients staff open accounts for.
 */
export const LOCALE_PARAM = 'lang';

/**
 * Where a link carrying `?lang=` goes: the same address without it, and the
 * language to remember — `null` for a value this portal does not speak, whose
 * parameter is still dropped. `null` overall when the link carries none.
 */
export function languageFromLink(
  pathname: string,
  search: string,
): { target: string; locale: Locale | null } | null {
  const params = new URLSearchParams(search);
  if (!params.has(LOCALE_PARAM)) return null;
  const locale = parseLocale(params.get(LOCALE_PARAM));
  params.delete(LOCALE_PARAM);
  const rest = params.toString();
  return { target: rest ? `${pathname}?${rest}` : pathname, locale };
}
