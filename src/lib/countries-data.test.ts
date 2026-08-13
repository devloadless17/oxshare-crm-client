import { describe, expect, it } from 'vitest';
import { ALL_COUNTRIES, ALL_NATIONALITIES } from './countries-data';

/**
 * The excluded countries stay excluded.
 *
 * ## Why this earns its run time
 *
 * `ALL_COUNTRIES` is DERIVED from the `countries-list` package at module load,
 * not hand-written. That is what makes the exclusion fragile in a way a
 * hardcoded array would not be: the filter is one `.filter()` in a chain over
 * somebody else's data, and it breaks silently in at least three ways —
 *
 *   - a refactor of the chain drops the filter and every list grows by one,
 *   - the package changes an ISO code's casing and the `Set` stops matching,
 *   - a `countries-list` upgrade renames the entry.
 *
 * None of those fail a build, a type-check or any other test. The option simply
 * reappears in a dropdown nobody re-reads, and the first person to notice is a
 * client.
 *
 * The assertions are on the SHIPPED arrays rather than on the internal Set,
 * because the Set being right is not the guarantee — the rendered list being
 * right is. A test of the constant would pass with the filter deleted.
 */
describe('the offered country list', () => {
  it('excludes Israel by code, name and dial code', () => {
    expect(ALL_COUNTRIES.some((c) => c.code === 'IL')).toBe(false);
    expect(ALL_COUNTRIES.some((c) => c.name === 'Israel')).toBe(false);
    /*
     * The dial code too, not only the row. `+972` is what the phone picker
     * matches an existing value against, so a row that survived under a
     * different name or code would still hand a client the excluded prefix.
     */
    expect(ALL_COUNTRIES.some((c) => c.dialCode === '+972')).toBe(false);
  });

  it('excludes the matching nationality', () => {
    // Kept in step BY HAND — the demonym array has no code to join on, so this
    // is the assertion that catches the two halves drifting apart.
    expect(ALL_NATIONALITIES).not.toContain('Israeli');
  });

  it('still returns a full list, so the filter cannot be over-broad', () => {
    /*
     * The counterweight. Every assertion above passes on an EMPTY array, so
     * without this a filter bug that dropped all 250 countries — or one that
     * threw and left the export empty — would read as a clean suite while the
     * phone picker and the KYC country field rendered nothing at all.
     *
     * Loose bounds on purpose: this pins "the list is intact", not the exact
     * count, which changes whenever the upstream package does.
     */
    expect(ALL_COUNTRIES.length).toBeGreaterThan(200);
    expect(ALL_NATIONALITIES.length).toBeGreaterThan(150);
    // And the exclusion is surgical — neighbours in the same region are offered.
    expect(ALL_COUNTRIES.some((c) => c.code === 'LB')).toBe(true);
    expect(ALL_COUNTRIES.some((c) => c.code === 'JO')).toBe(true);
  });
});
