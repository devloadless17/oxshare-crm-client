import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { intlLocale, t } from '@/lib/i18n';
import { ltr } from '@/lib/bidi';

/**
 * The client's PROFILE, as the portal shows it (backend migration 0139).
 *
 * One record per person: registration writes it, the KYC personal step reads
 * and changes it, the support desk corrects it. The portal never holds a second
 * copy — these helpers only decide how its values READ on a screen.
 */

/** Every field of the profile — the backend's `PROFILE_FIELD_KEYS`. */
export const PROFILE_FIELD_KEYS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'nationality',
  'phone',
  'country',
  'address',
  'city',
  'stateProvince',
  'postalCode',
] as const;

export function isProfileKey(key: string): boolean {
  return (PROFILE_FIELD_KEYS as readonly string[]).includes(key);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/*
 * Built per call, in the ACTIVE language: a module-level formatter is made once
 * per server process and would print every later request's dates in whichever
 * language came first. English keeps `en-GB` ("15 June 1990").
 */
const longDate = () =>
  new Intl.DateTimeFormat(intlLocale() ?? 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * "15 June 1990" from "1990-06-15".
 *
 * A birthday is a CALENDAR DAY, not an instant: read as midnight in the
 * viewer's zone it prints the day before for everyone west of Greenwich. So it
 * is built and formatted in UTC, where the day is the day that was stored.
 */
export function formatDateOfBirth(value?: string | null): string | undefined {
  const match = ISO_DAY.exec(value ?? '');
  if (!match) return value?.trim() || undefined;
  const [, year = '', month = '', day = ''] = match;
  return longDate().format(new Date(Date.UTC(+year, +month - 1, +day)));
}

/**
 * A stored number (E.164, `+96170123456`) grouped the way it is read: `+961 70 123 456`.
 * Isolated left to right (`ltr`): in Arabic, bidi would otherwise print the
 * groups in reverse order.
 */
export function formatPhone(value?: string | null): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return ltr(parsePhoneNumberFromString(text)?.formatInternational() ?? text);
}

/** The address as one line — street, city, state, postal code — leaving out what is absent. */
export function addressLine(parts: {
  address?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
}): string | undefined {
  const line = [parts.address, parts.city, parts.stateProvince, parts.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(t('common.listSeparator'));
  return line || undefined;
}
