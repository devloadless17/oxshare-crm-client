import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

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
  'postalCode',
] as const;

export function isProfileKey(key: string): boolean {
  return (PROFILE_FIELD_KEYS as readonly string[]).includes(key);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
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
  return LONG_DATE.format(new Date(Date.UTC(+year, +month - 1, +day)));
}

/** A stored number (E.164, `+96170123456`) grouped the way it is read: `+961 70 123 456`. */
export function formatPhone(value?: string | null): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return parsePhoneNumberFromString(text)?.formatInternational() ?? text;
}

/** The address as one line — street, city, postal code — leaving out what is absent. */
export function addressLine(parts: {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
}): string | undefined {
  const line = [parts.address, parts.city, parts.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  return line || undefined;
}
