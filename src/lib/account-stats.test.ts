import { describe, expect, it } from 'vitest';
import { moneySign } from './account-stats';

/**
 * The sign derivation behind every coloured money figure on the account panels.
 *
 * Here for the same reason `date-range.test.ts` is: the wrong answer renders
 * perfectly. A P/L sign taken from a float is a plausible colour — it does not
 * throw, and it is not visible in review.
 *
 * Mutation-checked when written: each guarantee was deliberately broken and the
 * named test failed on the right assertion.
 *
 * `winRate` was pinned here too, holding the one denominator rule that makes a
 * win rate honest. It went when the Activity card and the history request behind
 * it were removed from `/accounts/:id` — see the note in `account-stats.ts`
 * before reviving those statistics.
 */

describe('moneySign — what colours a P/L figure', () => {
  /*
   * A loss too small for a float to keep.
   *
   * `-0.00000001` is a real value on a NUMERIC(28,8) column. Through
   * `Number()` it survives, but the family of coercion bugs this guards
   * against rounds small magnitudes to `-0`, where `> 0` and `< 0` are both
   * false — and the figure renders as a neutral zero rather than as the loss it
   * is.
   */
  it('reads an eight-decimal loss as negative', () => {
    expect(moneySign('-0.00000001')).toBe('negative');
  });

  it('reads an amount past float precision as positive', () => {
    // `Number('12345678901234567.89')` is already inexact before any comparison.
    expect(moneySign('12345678901234567.89')).toBe('positive');
  });

  /*
   * The API's spelling of zero is not fixed — it has returned '0' and
   * '0.00000000' for the same fact. Comparing against one literal breaks the
   * day it changes, so every spelling must read the same.
   */
  it('treats every spelling of zero as zero', () => {
    expect(moneySign('0')).toBe('zero');
    expect(moneySign('0.00')).toBe('zero');
    expect(moneySign('0.00000000')).toBe('zero');
    expect(moneySign('-0.00000000')).toBe('zero');
  });

  /*
   * The reason this does not delegate to `compareMoney`.
   *
   * `compareMoney` falls back to `localeCompare` on an unparseable value, by
   * design — a bad row must not take down a list render. Applied to a SIGN that
   * fallback returns a positive number for 'unavailable', which would paint a
   * garbage value in profit green with a plus in front of it.
   */
  it('treats an unparseable value as zero rather than as a gain', () => {
    expect(moneySign('unavailable')).toBe('zero');
    expect(moneySign('')).toBe('zero');
  });

  it('reads ordinary gains and losses', () => {
    expect(moneySign('840.20000000')).toBe('positive');
    expect(moneySign('-449.80000000')).toBe('negative');
  });
});
