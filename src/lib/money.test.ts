import { describe, expect, it } from 'vitest';
import { formatMoney, isZeroMoney } from './money';

/**
 * The only formatter money is allowed through — ARCHITECTURE §6.1.
 *
 * The rule it exists to hold is that a monetary value never becomes a JS
 * number. The tests that matter most here are therefore the ugly ones: values
 * beyond 2^53, values with eight decimal places, and the shapes `parseFloat`
 * would happily accept and quietly ruin.
 *
 * A test asserting `formatMoney('10', 'USD') === '$10.00'` proves almost
 * nothing — `Number(10).toFixed(2)` passes it too. These are chosen so a
 * refactor to `Number()` or `Intl.NumberFormat` FAILS.
 */

describe('precision — the reason this function exists', () => {
  it('survives a value beyond what a float can hold exactly', () => {
    /*
     * `Number('12345678901234567.89')` is 12345678901234568 before formatting
     * has even started. This is the assertion a `Number()` refactor cannot
     * pass, and it is the one the backend's own tests mirror.
     */
    expect(formatMoney('12345678901234567.89', 'USD')).toBe('$12,345,678,901,234,567.89');
  });

  it('rounds half-up at the second decimal, for display only', () => {
    expect(formatMoney('1.005', 'USD')).toBe('$1.01');
    expect(formatMoney('1.004', 'USD')).toBe('$1.00');
  });

  it('renders the full stored scale down to the last hundredth', () => {
    // NUMERIC(28,8) means eight places arrive; two are shown. The rest are
    // rounded for humans and never for arithmetic.
    expect(formatMoney('0.00500000', 'USD')).toBe('$0.01');
    expect(formatMoney('0.00400000', 'USD')).toBe('$0.00');
  });

  it('groups thousands without touching the number', () => {
    expect(formatMoney('1234567.5', 'USD')).toBe('$1,234,567.50');
    expect(formatMoney('999.99', 'USD')).toBe('$999.99');
    expect(formatMoney('1000', 'USD')).toBe('$1,000.00');
  });
});

describe('currency presentation', () => {
  it('puts a known symbol in front', () => {
    expect(formatMoney('12.5', 'USD')).toBe('$12.50');
  });

  it('puts an unknown code behind, rather than inventing a symbol', () => {
    // USDT has no glyph. A made-up one would be worse than the code itself.
    expect(formatMoney('12.5', 'USDT')).toBe('12.50 USDT');
    expect(formatMoney('12.5', 'EUR')).toBe('12.50 EUR');
  });

  it('keeps the sign outside the symbol', () => {
    // `$-5.00` is what naive concatenation produces and is not how anyone
    // writes money.
    expect(formatMoney('-5', 'USD')).toBe('-$5.00');
    expect(formatMoney('-5', 'USDT')).toBe('-5.00 USDT');
  });
});

describe('what it does with a value it cannot read', () => {
  /**
   * A balance card must not take the page down — and must not invent a number.
   *
   * Both halves matter. Returning `'0.00'` here would be worse than throwing:
   * it is indistinguishable on screen from a real empty wallet, which is the
   * exact failure the "never mock data" rule in CLAUDE.md exists to prevent.
   */
  it.each(['', 'abc', 'NaN', 'Infinity', '--1'])('falls back for %o', (value) => {
    expect(formatMoney(value, 'USD')).toBe('—');
  });

  it('honours a caller-supplied fallback', () => {
    expect(formatMoney('nonsense', 'USD', 'not available')).toBe('not available');
  });
});

describe('isZeroMoney', () => {
  it('is true for every spelling of zero the API might send', () => {
    /*
     * The reason this is not `value !== '0.00000000'`. The backend currently
     * returns a fixed 8dp string, and a comparison against that exact shape
     * breaks silently the day it returns `'0'` — showing a client "you have a
     * balance" for an empty wallet.
     */
    for (const zero of ['0', '0.0', '0.00000000', '-0', '0.000']) {
      expect(isZeroMoney(zero)).toBe(true);
    }
  });

  it('is false for a balance that is merely small', () => {
    // One satoshi-scale unit is not zero, and a `parseFloat` comparison at 2dp
    // would say it was.
    expect(isZeroMoney('0.00000001')).toBe(false);
    expect(isZeroMoney('0.001')).toBe(false);
  });

  it('is false for an unreadable value rather than treating it as empty', () => {
    // "I cannot tell" is not "there is nothing there". A wallet whose balance
    // failed to parse must not render as an empty one.
    expect(isZeroMoney('abc')).toBe(false);
    expect(isZeroMoney('')).toBe(false);
  });
});
