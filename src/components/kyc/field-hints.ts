import type { components } from '@/lib/api/types.gen';

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];

/**
 * FR-CORE-15: applicants must be 18+, so the date-of-birth picker stops there.
 *
 * Evaluated once when the module loads, not during render. `Date.now()` in a
 * render body (or in a `useMemo`, which React may re-run at any time) makes the
 * component impure: two renders a millisecond apart can disagree. The value is
 * fresh per page load, and the real check is server-side (`kyc-profile.ts`).
 *
 * ## Calendar years, not 365.25 of them
 *
 * This subtracted `18 * 365.25` DAYS. The server counts calendar years
 * (`ageInYears`, month-and-day compared), and 18 calendar years is 6574 or 6575
 * days depending on how many 29 Februaries they span — never 6574.5. So the two
 * definitions of "18" disagreed by up to a day, in BOTH directions:
 *
 *   - a client whose 18th birthday is TODAY was refused by the picker, on the
 *     one day it matters most to them, while the server would have accepted;
 *   - a client who turns 18 TOMORROW could pick their date, fill the rest of
 *     the flow, upload three documents and only then be refused at submit.
 *
 * Subtracting 18 from the year is the same arithmetic the server does, so the
 * picker's boundary and the rule's boundary are the same date by construction
 * rather than by two approximations landing close enough.
 *
 * ## The 29 February clamp
 *
 * On 29 February the target year is not a leap year, and `Date.UTC(y, 1, 29)`
 * ROLLS FORWARD to 1 March. Left alone that hands back a cap one day too late:
 * `ageInYears` reads a 1 March birthday as not yet reached on 29 February, so
 * the picker would have offered a date the server then refused. Clamped to the
 * last day of the intended month (28 February), which is the latest date of
 * birth the server actually accepts on that day.
 */
/**
 * Exported for the test, which pins the boundary on fixed days rather than on
 * whatever day the suite happens to run — including 29 February, which is
 * unreachable from `new Date()` for three years out of four.
 */
export function latestDateOfBirthFor(minimumAgeYears: number, asOf: Date): string {
  const year = asOf.getUTCFullYear() - minimumAgeYears;
  const month = asOf.getUTCMonth();
  const cap = new Date(Date.UTC(year, month, asOf.getUTCDate()));
  // Day 0 of the NEXT month is the last day of this one.
  const clamped = cap.getUTCMonth() === month ? cap : new Date(Date.UTC(year, month + 1, 0));
  return clamped.toISOString().split('T')[0]!;
}

export const MAX_DATE_OF_BIRTH = latestDateOfBirthFor(18, new Date());

/*
 * `NATIVE_SELECT_THRESHOLD` IS GONE. It switched long lists (country,
 * nationality) to a native <select> for the OS picker's type-ahead; that was
 * reversed on an explicit instruction so every select on the form is the
 * styled one — see the comment at the select branch in `step-field.tsx`.
 */

/**
 * Browser hints for a free-text profile field, keyed on the field's machine name.
 *
 * Not decoration. This form is filled in once, on a phone, with a keyboard
 * covering half the screen — and it carried NO `autoComplete` attribute
 * anywhere, so a saved address was never offered and every character of it was
 * typed by hand. `autoCapitalize` matters for the same reason in the other
 * direction: name fields were not capitalising and address fields were.
 *
 * Keyed on `name` rather than on `type` because the field set is
 * admin-configurable (D-29) and the names are the contract the portal already
 * submits by — the same ids the reviewer flags for correction. An unknown custom
 * field gets sensible text defaults rather than nothing.
 */
export function textInputHints(name: string): {
  autoComplete: string;
  autoCapitalize?: string;
  inputMode?: 'text' | 'tel' | 'email';
  type?: string;
} {
  switch (name) {
    case 'firstName':
      return { autoComplete: 'given-name', autoCapitalize: 'words' };
    case 'lastName':
      return { autoComplete: 'family-name', autoCapitalize: 'words' };
    case 'address':
      return { autoComplete: 'street-address', autoCapitalize: 'words' };
    case 'city':
      return { autoComplete: 'address-level2', autoCapitalize: 'words' };
    case 'postalCode':
    case 'postcode':
      // `inputMode` rather than `type="number"`: postcodes are not numbers —
      // they have letters and leading zeros, and a number input would eat both.
      return { autoComplete: 'postal-code', autoCapitalize: 'characters', inputMode: 'text' };
    case 'phone':
      return { autoComplete: 'tel', inputMode: 'tel', type: 'tel' };
    case 'email':
      return { autoComplete: 'email', inputMode: 'email', type: 'email', autoCapitalize: 'none' };
    case 'nationality':
    case 'country':
      return { autoComplete: 'country-name', autoCapitalize: 'words' };
    default:
      // `off` rather than omitted: an unrecognised custom field is more likely to
      // be document-specific (an ID number, a tax reference) than something the
      // browser has a saved value for, and a wrong autofill is worse than none.
      return { autoComplete: 'off', autoCapitalize: 'sentences' };
  }
}
