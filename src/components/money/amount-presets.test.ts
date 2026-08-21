import { describe, expect, it } from 'vitest';
import { AMOUNT_PRESETS, presetsWithin } from './amount-presets';

/**
 * The quick-pick deposit amounts.
 *
 * The rule: a preset the client cannot use is WORSE than no preset, because it
 * fills the field with a value the form then refuses — the one-tap control
 * produces an error message. So anything outside the bounds is dropped, never
 * clamped: a button labelled $500 that enters $412.30 is a lie about what it
 * does.
 */
describe('offering preset amounts', () => {
  it('offers every preset when the method has no limits', () => {
    expect(presetsWithin(null, null)).toEqual(AMOUNT_PRESETS);
    expect(presetsWithin()).toEqual(AMOUNT_PRESETS);
  });

  it('drops presets below the minimum', () => {
    expect(presetsWithin('100', null)).toEqual(['100', '250', '500', '1000']);
  });

  it('drops presets above the maximum', () => {
    expect(presetsWithin(null, '250')).toEqual(['50', '100', '250']);
  });

  /* Inclusive at both ends — a preset exactly ON the limit is usable. */
  it('keeps a preset sitting exactly on a bound', () => {
    expect(presetsWithin('50', '50')).toEqual(['50']);
  });

  /*
   * DROPPED, never clamped. If the range excludes everything the answer is an
   * empty list and the form shows no quick-picks — not a button that enters a
   * number the client did not choose.
   */
  it('offers nothing rather than clamping when the range excludes every preset', () => {
    expect(presetsWithin('2000', null)).toEqual([]);
    expect(presetsWithin(null, '10')).toEqual([]);
  });

  /*
   * ⚠️ §6.1 — these compare against NUMERIC(28,8) strings and must go through
   * decimal.js. The bounds below are chosen so a float comparison would get
   * them wrong: `Number('100.00000000000000001')` is exactly 100, so a float
   * would treat this ceiling as admitting the 100 preset. Decimal does not.
   */
  it('compares against a bound a float could not represent', () => {
    // Just UNDER 100 by a margin no double can hold: 100 must be excluded.
    expect(presetsWithin(null, '99.999999999999999999')).toEqual(['50']);
    // Just OVER 1000 by the same margin: 1000 stays in.
    expect(presetsWithin(null, '1000.000000000000000001')).toEqual(AMOUNT_PRESETS);
  });

  it('handles an eight-decimal bound without rounding it away', () => {
    expect(presetsWithin('99.99999999', null)).toEqual(['100', '250', '500', '1000']);
  });
});
