/**
 * The sign-up form's model — two steps, one payload (25 Sep 2026).
 *
 * The client asked for the registration page to collect the personal details
 * too — date of birth, nationality, phone, residence, address — so that the
 * identity verification opens already filled in and nobody types their details
 * twice. The server keeps ONE copy of them (the client's profile, backend
 * migration 0139): what is typed here IS what the KYC form shows, and what the
 * KYC form changes is what the account holds.
 *
 * ## Which rules live here, and which do not
 *
 * The SERVER decides whether a value is acceptable — a name with a digit in it,
 * a phone nobody can dial, an under-18 date of birth — and answers per field,
 * which the form puts beside the box it belongs to (`stepOf` sends the client
 * back to the step that holds it). Nothing here re-implements those rules: a
 * second copy of them is how "t1" and "test1" came to be two names for one
 * person.
 *
 * What lives here is only what the SCREEN needs to know: which fields each
 * step shows, which it will not let you leave empty, and what goes on the wire.
 */

import type { RegisterDto } from '@/lib/api/auth';

export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  dateOfBirth: string;
  nationality: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
}

export type RegisterField = keyof RegisterValues;

export const EMPTY_REGISTER_VALUES: RegisterValues = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  dateOfBirth: '',
  nationality: '',
  phone: '',
  country: '',
  city: '',
  address: '',
  postalCode: '',
};

/** Step 1 — who is signing in. */
export const ACCOUNT_FIELDS: readonly RegisterField[] = [
  'firstName',
  'lastName',
  'email',
  'password',
];

/** Step 2 — the profile the KYC form opens with. */
export const DETAIL_FIELDS: readonly RegisterField[] = [
  'dateOfBirth',
  'nationality',
  'phone',
  'country',
  'city',
  'address',
  'postalCode',
];

/**
 * Which of step 2's details sign-up REQUIRES — the SERVER's rule, served with
 * the country lists (`GET /profile/options` → `required.registration`), never
 * a copy kept here (26 Sep 2026: the API enforces names, date of birth,
 * nationality, phone and country, and refuses a sign-up without them, per
 * field). Before the lists arrive nothing is claimed required: the server
 * still judges, and answers under each field.
 */
export function requiredDetailFields(
  options: { required?: { registration?: readonly string[] } } | undefined,
): RegisterField[] {
  const registration = options?.required?.registration ?? [];
  return DETAIL_FIELDS.filter((field) => registration.includes(field));
}

/** Which step shows a field — where to send the client for a server's refusal. */
export function stepOf(field: string): 1 | 2 {
  return (ACCOUNT_FIELDS as readonly string[]).includes(field) ? 1 : 2;
}

/**
 * Whether a phone value holds a NUMBER, not just the dial code the phone input
 * starts on ("+961" before a digit is typed). Digits are COUNTED after the code,
 * never matched as a run: "+961 70 123 456" has no four digits in a row and is
 * plainly a number — reading it as empty once cost a typed number its value.
 */
export function hasNationalNumber(phone: string): boolean {
  const national = phone.trim().replace(/^\+\d{1,4}/, '');
  return national.replace(/\D/g, '').length >= 4;
}

/** The required fields left empty. A phone that is only a dial code is empty. */
export function missingFields(
  values: RegisterValues,
  fields: readonly RegisterField[],
): RegisterField[] {
  return fields.filter((field) =>
    field === 'phone' ? !hasNationalNumber(values.phone) : values[field].trim() === '',
  );
}

/** The first field — in the order the steps show them — with a message. */
export function firstErrorField(errors: Partial<Record<string, string>>): string | undefined {
  return [...ACCOUNT_FIELDS, ...DETAIL_FIELDS].find((field) => errors[field]);
}

/**
 * The request body. Blank optional fields are OMITTED rather than sent empty —
 * absence means "not given", an empty string is a value the API would have to
 * interpret — and a phone that is only its dial code is blank. (`undefined`
 * keys do not survive `JSON.stringify`, which is what omits them.)
 *
 * The password is sent exactly as typed: a space at either end is part of it.
 */
export function registerPayload(
  values: RegisterValues,
  referralCode: string | undefined,
): RegisterDto {
  const given = (field: RegisterField): string | undefined => {
    const value = values[field].trim();
    return value === '' ? undefined : value;
  };
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    password: values.password,
    dateOfBirth: given('dateOfBirth'),
    nationality: given('nationality'),
    phone: missingFields(values, ['phone']).length === 0 ? given('phone') : undefined,
    country: given('country'),
    city: given('city'),
    address: given('address'),
    postalCode: given('postalCode'),
    referralCode: referralCode || undefined,
  };
}
