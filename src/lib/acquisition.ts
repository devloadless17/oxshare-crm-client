import { normaliseReferralCode } from './referral-code';

/**
 * An administrator's sign-up link (backend 0195): `/join/<code>`.
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

/** A code as the link carried it, cleaned by the same rule as a referral code. */
export function normaliseAcquisitionCode(raw: string | null | undefined): string | undefined {
  const code = normaliseReferralCode(raw);
  return code && code.length <= 32 ? code : undefined;
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
