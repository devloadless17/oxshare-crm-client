/**
 * An administrator's sign-up link (backend 0198): `/join/<word>`, one per
 * administrator, a readable word like `omar-farah`.
 *
 * The code is kept in a first-party cookie for 30 days — last click wins — so
 * a visitor who browses away and signs up next week still lands in the right
 * administrator's book. It is not a secret and gates nothing: the API decides
 * what the code means at registration, and an unknown or dead code is simply
 * ignored there. Not HttpOnly, because the sign-up form reads it.
 */
export const ACQUISITION_COOKIE = 'oxshare_acq';
export const ACQUISITION_PARAM = 'a';
export const ACQUISITION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The API's rule for a link word: lowercase letters, digits, - and _, 3–32. */
const SIGNUP_SLUG = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/;

/**
 * A link word as the URL delivered it: lower-cased, transport debris (a trailing
 * slash, quotes, spaces) removed — the backend's `normaliseSignupSlug`, so what
 * is sent is what the API will look up. Undefined when nothing usable is left.
 */
export function normaliseAcquisitionCode(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+|[-_]+$/g, '');
  return SIGNUP_SLUG.test(cleaned) ? cleaned : undefined;
}

/** The code to send at sign-up: the URL's `?a=` first, then the remembered link. */
export function acquisitionCodeFor(
  fromUrl: string | null | undefined,
  cookieHeader: string | undefined = typeof document === 'undefined' ? undefined : document.cookie,
): string | undefined {
  const direct = normaliseAcquisitionCode(fromUrl);
  if (direct) return direct;
  const match = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACQUISITION_COOKIE}=`));
  return normaliseAcquisitionCode(match?.slice(ACQUISITION_COOKIE.length + 1));
}
