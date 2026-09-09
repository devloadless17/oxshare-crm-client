import type { components } from '@/lib/api/types.gen';

export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];

/**
 * FR-CORE-15: applicants must be 18+, so the date-of-birth picker stops there.
 *
 * Evaluated once when the module loads, not during render. `Date.now()` in a
 * render body (or in a `useMemo`, which React may re-run at any time) makes the
 * component impure: two renders a millisecond apart can disagree. The value is
 * fresh per page load, and the real check is server-side (`kyc-profile.ts`).
 */
export const MAX_DATE_OF_BIRTH = new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];

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
