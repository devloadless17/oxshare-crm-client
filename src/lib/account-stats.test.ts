import { describe, expect, it } from 'vitest';
import { moneySign, showsRealisedAmount, winRate } from './account-stats';

/**
 * The two derivations on the trading-account statistics panel.
 *
 * Both are here for the same reason `date-range.test.ts` is: the wrong answer
 * renders perfectly. A win rate computed against the wrong denominator is a
 * plausible percentage, and a P/L sign taken from a float is a plausible colour.
 * Neither throws, and neither is visible in review.
 *
 * Mutation-checked when written: each guarantee was deliberately broken and the
 * named test failed on the right assertion. One exception, recorded because it
 * matters more than the test does — the wrong win-rate denominator could not be
 * mutated IN, because `winRate` takes only `trades` and `wins` and `losses` is
 * not in scope to divide by. The type prevents it; the test below pins the
 * arithmetic that remains.
 */

describe('winRate — the denominator', () => {
  /*
   * THE regression this file exists for.
   *
   * `wins / (wins + losses)` is the obvious implementation and it is wrong,
   * because a trade closing at exactly zero is neither a win nor a loss. This
   * account won 8 of 20 — 40% — and the broken version reports 80%.
   *
   * The numbers are chosen so the two answers are far apart. An account with no
   * scratch trades gives the same result either way, which is exactly why the
   * bug survives on most test data.
   */
  it('divides by every closed trade, not by wins plus losses', () => {
    expect(winRate({ trades: 20, wins: 8 })).toBe(40);
  });

  it('agrees with the naive version when nothing closed flat', () => {
    expect(winRate({ trades: 10, wins: 7 })).toBe(70);
  });

  /*
   * Null, never 0. "0% of no trades" is a statement about performance that has
   * not happened, and the panel renders the null as an em dash — the same rule
   * the wallet follows for a currency that has not been opened.
   */
  it('is null with no closed trades, rather than zero percent', () => {
    expect(winRate({ trades: 0, wins: 0 })).toBeNull();
  });
});

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

describe('showsRealisedAmount — which rows show an amount', () => {
  /*
   * THE regression: ten real movements rendered as no movement.
   *
   * Every row below is copied from the account that exposed this — login
   * 6477978, whose history is entirely deposits and CRM transfers. The screen
   * branched on `!closing` alone, and because a balance operation never closes a
   * position, all ten showed the "pending" em dash. A $1,000 transfer displayed
   * as a dash in the only column carrying a figure.
   */
  it('shows the amount on a balance operation, which never closes a position', () => {
    expect(showsRealisedAmount({ actionLabel: 'balance', closing: false })).toBe(true);
  });

  it.each(['credit', 'charge', 'correction', 'bonus', 'commission', 'interest'])(
    'shows the amount on a %s row, for the same reason',
    (actionLabel) => {
      // None of these close a position either, and every one of them is money
      // that has already moved. A dash on any is the same bug in another costume.
      expect(showsRealisedAmount({ actionLabel, closing: false })).toBe(true);
    },
  );

  it('withholds the amount on a trade that has NOT closed', () => {
    /*
     * The half of the original rule that was right, and it must survive this
     * fix. An open position carries `profit: '0'` as a placeholder; rendering it
     * as `$0.00` tells a client their live trade broke even.
     */
    expect(showsRealisedAmount({ actionLabel: 'buy', closing: false })).toBe(false);
    expect(showsRealisedAmount({ actionLabel: 'sell', closing: false })).toBe(false);
  });

  it('shows the amount on a trade that HAS closed', () => {
    expect(showsRealisedAmount({ actionLabel: 'buy', closing: true })).toBe(true);
    expect(showsRealisedAmount({ actionLabel: 'sell', closing: true })).toBe(true);
  });

  it('shows the amount for an action label this build has never heard of', () => {
    /*
     * A newer MT5 build sends an action this app does not know. Defaulting to
     * "withhold" would hide a real figure behind a dash on every row of that
     * type — silently, and only on the accounts that have them. Showing the
     * number the server sent is the recoverable direction to fail in.
     */
    expect(showsRealisedAmount({ actionLabel: 'action 19', closing: false })).toBe(true);
  });
});
