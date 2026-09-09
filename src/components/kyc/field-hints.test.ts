import { describe, expect, it } from 'vitest';

import { latestDateOfBirthFor } from './field-hints';

/**
 * THE PICKER'S BOUNDARY IS THE SERVER'S BOUNDARY.
 *
 * The date-of-birth picker caps itself so an applicant under 18 cannot choose a
 * date at all (FR-CORE-15). The rule that actually decides is server-side, in
 * `kyc-profile.ts` — this only has to agree with it.
 *
 * It did not. The cap subtracted `18 * 365.25` DAYS while the server counts
 * calendar years, and 18 calendar years is 6574 or 6575 days, never 6574.5. The
 * two boundaries drifted apart by up to a day in both directions: a client whose
 * 18th birthday was that day was refused by the picker, and a client who turned
 * 18 the NEXT day could pick a date, complete the flow, upload three documents
 * and only then be refused at submit.
 *
 * `ageInYears` below is the server's rule, transcribed. The property test drives
 * both against every day of a 33-year span — the approximation failed on
 * thousands of them, so a couple of hand-picked dates would not have been
 * convincing either way.
 */

/** `ageInYears` from the backend's `src/modules/compliance/kyc-profile.ts`. */
function ageInYears(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

const iso = (d: Date) => d.toISOString().split('T')[0]!;
const DAY = 86_400_000;

describe('the date-of-birth cap', () => {
  it('accepts a client whose 18th birthday is TODAY', () => {
    // The reported shape: refused on the one day it matters most to them.
    const today = new Date(Date.UTC(2026, 2, 1));
    expect(latestDateOfBirthFor(18, today)).toBe('2008-03-01');
  });

  it('refuses a client who turns 18 TOMORROW', () => {
    const today = new Date(Date.UTC(2026, 0, 1));
    // 2008-01-02 is a day too late; the cap must stop before it.
    expect(latestDateOfBirthFor(18, today) < '2008-01-02').toBe(true);
  });

  it('clamps 29 February to 28 February, not forward to 1 March', () => {
    /*
     * `Date.UTC(y, 1, 29)` rolls forward when `y` is not a leap year. Left
     * alone the cap lands on 1 March — which `ageInYears` reads as not yet
     * reached on 29 February, so the picker would offer a date the server
     * refuses.
     */
    const leapDay = new Date(Date.UTC(2044, 1, 29));
    expect(latestDateOfBirthFor(18, leapDay)).toBe('2026-02-28');
  });

  it('agrees with the server on every day of a 33-year span, in both directions', () => {
    let allowsUnderage = 0;
    let blocksAdult = 0;

    for (let d = 0; d < 12_000; d++) {
      for (const hour of [0, 11, 23]) {
        const asOf = new Date(Date.UTC(2026, 0, 1, hour) + d * DAY);
        const cap = latestDateOfBirthFor(18, asOf);

        // Only the days either side of the boundary can disagree.
        for (let k = -2; k <= 2; k++) {
          const dob = iso(new Date(new Date(`${cap}T00:00:00Z`).getTime() + k * DAY));
          const pickerAllows = dob <= cap;
          const serverAllows = ageInYears(new Date(`${dob}T00:00:00Z`), asOf) >= 18;
          if (pickerAllows && !serverAllows) allowsUnderage++;
          if (!pickerAllows && serverAllows) blocksAdult++;
        }
      }
    }

    expect(allowsUnderage, 'the picker offered a date the server refuses').toBe(0);
    expect(blocksAdult, 'the picker refused a date the server accepts').toBe(0);
  });
});
