import { parseLocale } from './locale-storage';
import type { Locale } from './index';

/**
 * The language a phone or browser asks for (`Accept-Language`), for a visitor
 * who has never chosen one here: the first language in their order of
 * preference that this portal speaks, or `null`.
 *
 * Without it every first visit opened in English. On an Arabic phone Chrome then
 * offered, or applied by itself, "Translate to Arabic", and translation rewrites
 * the page's text behind React's back: the next change on screen threw
 * `NotFoundError: insertBefore`, the error screen came up, and a reload
 * translated and crashed again (16 Oct 2026, clients stuck at sign-up and KYC).
 * An Arabic phone now gets the portal's own Arabic, and `translate="no"` on the
 * page keeps the browser from translating it anyway.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: (tag ?? '').toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    // Highest weight first; equal weights keep the order the browser sent.
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = parseLocale(tag.split('-')[0]);
    if (locale) return locale;
  }
  return null;
}
