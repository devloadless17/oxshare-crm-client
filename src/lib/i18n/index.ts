import { messages, type MessageKey } from './messages';
import { arMessages } from './messages.ar';
import { readStoredLocale } from './locale-storage';

/**
 * The translation seam — `docs/CLAUDE.md` "Designed for change", seam 4.
 *
 * NO LONGER A TWIN (Oct 2026). The admin app keeps its English-only copy; this
 * one carries two catalogues and resolves the language per request, which the
 * admin has no reason to do.
 *
 * ── How the language is chosen ────────────────────────────────────────────
 *
 * ONE source: the `oxshare-portal-locale` cookie (`locale-storage.ts`). A cookie
 * rather than localStorage because the SERVER must render the right language
 * from the first byte: the root layout reads it, sets `<html lang dir>`, and
 * hands it to `<LocaleProvider>`. With localStorage the server could only render
 * English and the client corrected it after hydration, which is a flash of
 * English on every Arabic page and a hydration mismatch on every string.
 *
 * On the client the active locale is read from the cookie when this module is
 * first evaluated — before React hydrates — so the client's first render matches
 * the server's. Changing language writes the cookie and RELOADS the page
 * (`switchLocale`), so nothing rendered or cached in the old language survives:
 * module-level labels, React Query data holding server sentences, open toasts.
 *
 * `t()` stays a plain function, not a hook, because it is called from event
 * handlers, toasts and helpers as well as render. `useTranslation()` returns it
 * for components written in the hook shape.
 */

export type Locale = 'en' | 'ar';

/** Every locale the portal offers, in switcher order. */
export const LOCALES: readonly Locale[] = ['en', 'ar'];

/** Locales that read right-to-left. FSD §10 names Arabic specifically. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/** The language used when nothing is stored. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Each locale's name in its OWN language — a switcher lists "العربية", never "Arabic". */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', ar: 'العربية' };

/**
 * `Record<MessageKey, string>` on the Arabic side is what makes a missing
 * translation a COMPILE error: a key added to `messages.ts` without its Arabic
 * twin does not build. `messages.ar.test.ts` adds what a type cannot see —
 * every placeholder survives translation.
 */
const CATALOGUES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en: messages,
  ar: arMessages,
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/*
 * The active locale. On the client: the cookie, read once at module load (see
 * the header). On the server: whatever `<LocaleProvider>` set for the request
 * being rendered — server code that renders OUTSIDE that provider (metadata,
 * server components) must use `translate(locale, …)` with `serverLocale()`.
 */
let active: Locale = readStoredLocale() ?? DEFAULT_LOCALE;

/** The active locale. */
export function currentLocale(): Locale {
  return active;
}

/**
 * Set the active locale. Called by `<LocaleProvider>` during render with the
 * locale the server resolved from the cookie, so SSR and hydration agree.
 * Never call it to SWITCH language — use `switchLocale`, which persists and
 * reloads.
 */
export function setActiveLocale(locale: Locale): void {
  active = locale;
}

/** Writing direction for a locale, for the `dir` attribute on `<html>`. */
export function direction(locale: Locale = currentLocale()): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/**
 * The BCP 47 tag handed to `Intl` and `toLocale*String` for dates and times.
 *
 * Arabic gets `-u-nu-latn`: Arabic month and day names with WESTERN digits.
 * This is a money product; an account number, a balance or a date read in
 * Eastern Arabic digits beside the same figure in Latin digits on a receipt,
 * an MT5 terminal or a bank statement is a reconciliation problem, and Western
 * digits are what Lebanese banks and brokers print.
 *
 * English returns `undefined` — the browser's own convention — which is what
 * every English date in the portal has always used.
 */
export function intlLocale(locale: Locale = currentLocale()): string | undefined {
  return locale === 'ar' ? 'ar-u-nu-latn' : undefined;
}

/** First-strong isolate / pop: the run takes its direction from its own first letter. */
const FSI = '\u2068';
const PDI = '\u2069';

/**
 * The broker's own text in the active language: the Arabic when the locale is
 * Arabic and the operator wrote one, else the English.
 *
 * For content the ADMIN authors (KYC questions, options, step titles…), which
 * arrives with both languages. A blank Arabic falls back to English rather than
 * rendering an empty label — an untranslated question is still a question.
 *
 * That English fallback, shown on an ARABIC page, comes back wrapped in
 * FIRST-STRONG ISOLATE … POP DIRECTIONAL ISOLATE (U+2068 … U+2069) so it is laid
 * out as the English it is. Bare, the bidi algorithm reads it inside the
 * right-to-left line around it: "Created by the walkthrough." printed as
 * ".Created by the walkthrough" on the Arabic partner screen (found in the
 * Arabic end-to-end test, 3 Oct 2026). Isolate characters are invisible and work
 * anywhere a string goes — a label, an option, a `title`. The result is for
 * DISPLAY only, which is all this function was ever for; never compare or send it.
 */
export function localized(
  en: string,
  ar?: string | null,
  locale: Locale = currentLocale(),
): string {
  if (locale !== 'ar') return en;
  if (typeof ar === 'string' && ar.trim() !== '') return ar;
  return /[A-Za-z]/.test(en) && !/[\u0600-\u06FF]/.test(en) ? FSI + en + PDI : en;
}

/** Values substituted into a message's `{placeholders}`. */
/**
 * `undefined` is ALLOWED, and is the documented failure mode below: a var the
 * caller could not supply leaves its `{placeholder}` visible rather than
 * rendering an empty gap. The type says so because `t()` already implements it.
 */
export type MessageVars = Record<string, string | number | undefined>;

/** Intl.PluralRules order for a six-branch selector. */
const SIX_FORMS: readonly Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

const pluralRules = new Map<Locale, Intl.PluralRules>();
function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}

/**
 * A message in a GIVEN locale, placeholders filled.
 *
 * Keys are typed, so a mistyped key does not compile. Placeholders are
 * `{named}` rather than positional, because word order changes between
 * languages and a positional argument silently ends up in the wrong slot.
 *
 * An unknown placeholder is left as-is rather than replaced with `undefined`:
 * seeing `{amount}` in the UI is an obvious bug, while "on hold: undefined" is
 * one someone screenshots and asks about.
 */
export function translate(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const template: string = CATALOGUES[locale][key] ?? messages[key];
  if (!vars) return template;

  const filled = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });

  /*
   * PLURALS — `{count:network|networks}` picks by the var: the singular for
   * exactly 1, the plural otherwise (0 networks, 2 networks). It replaced the
   * "network(s)" shorthand, which reads as a form letter in the one place an
   * operator is being told something is wrong.
   *
   * SIX branches — `{count:zero|one|two|few|many|other}` — pick by the
   * locale's CLDR plural rules. Arabic needs them: a counted noun is singular
   * for 1, DUAL for 2, plural for 3–10 and singular again from 11, and a
   * two-way selector gets most of those wrong.
   *
   * Applied AFTER the plain fill, so a branch may itself say `{count}`
   * (`{count:The wallet|All {count} wallets}`). A var the caller did not supply
   * leaves the selector visible, for the same reason as a plain placeholder.
   */
  return filled.replace(/\{(\w+):([^{}]*)\}/g, (whole, name: string, body: string) => {
    const value = vars[name];
    if (value === undefined) return whole;
    const branches = body.split('|');
    const [one = whole, other = whole] = branches;
    if (branches.length === 2) return String(value) === '1' ? one : other;
    if (branches.length === SIX_FORMS.length) {
      const fallback = branches[5] ?? whole;
      const count = Number(value);
      if (!Number.isFinite(count)) return fallback;
      return branches[SIX_FORMS.indexOf(pluralCategory(locale, count))] ?? fallback;
    }
    return whole;
  });
}

/** A message in the ACTIVE locale. See `translate`. */
export function t(key: MessageKey, vars?: MessageVars): string {
  return translate(active, key, vars);
}

/**
 * Hook form, for components written as `const { t } = useTranslation()`.
 * Returns the same `t` — the locale cannot change without a reload.
 */
export function useTranslation(): { t: typeof t; locale: Locale; dir: 'ltr' | 'rtl' } {
  const locale = currentLocale();
  return { t, locale, dir: direction(locale) };
}

export { messages, type MessageKey };
export { LOCALE_COOKIE, readStoredLocale, storeLocale } from './locale-storage';
