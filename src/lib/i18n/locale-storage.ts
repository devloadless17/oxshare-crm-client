import type { Locale } from './index';

/**
 * Where the chosen language is remembered: ONE cookie, `oxshare-portal-locale`.
 *
 * NO LONGER A TWIN (Oct 2026) — see `./index.ts`.
 *
 * A COOKIE, where it used to be localStorage, because the server now renders
 * the chosen language: `app/layout.tsx` reads this cookie to set `<html lang
 * dir>` and the language of the first paint. localStorage never reaches the
 * server, so an Arabic reader was served English and watched it flip.
 *
 * Not a credential and not httpOnly — the client reads it too, before React
 * hydrates. Namespaced per app (the `oxshare-portal-*` convention the theme key
 * already follows) so another OxShare property on the same registrable domain
 * cannot overwrite it. It also travels to the API through the `/api` rewrite,
 * but the API reads the explicit `X-OxShare-Locale` header (`api/client.ts`),
 * which this app sends on every request.
 */
export const LOCALE_COOKIE = 'oxshare-portal-locale';

/** The localStorage key the pre-cookie builds wrote; read once to carry a choice over. */
const LEGACY_STORAGE_KEY = 'oxshare-portal-locale';

/** One year: a display preference should outlive any session. */
export const LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const SUPPORTED: readonly Locale[] = ['en', 'ar'];

export function parseLocale(value: string | null | undefined): Locale | null {
  return typeof value === 'string' && (SUPPORTED as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

function readCookie(): string | null {
  const prefix = `${LOCALE_COOKIE}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

/**
 * The stored language, or `null` when there is none or it is unusable.
 *
 * Returns null rather than throwing on every failure path — a blocked cookie
 * jar, an unknown value left by an older build — none of that is a reason to
 * fail a page render. The caller falls back to the default locale.
 */
export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromCookie = parseLocale(readCookie());
    if (fromCookie) return fromCookie;
    // A choice made before the cookie existed: honour it once, then it lives in the cookie.
    const legacy = parseLocale(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) storeLocale(legacy);
    return legacy;
  } catch {
    return null;
  }
}

/** Remember a language choice. Silently a no-op where cookies are unavailable. */
export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // A preference that cannot be saved is not worth breaking the page over.
  }
}
