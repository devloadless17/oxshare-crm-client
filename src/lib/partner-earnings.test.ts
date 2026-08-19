import { describe, expect, it } from 'vitest';
import { summariseCommissions } from './partner-earnings';
import type { IbCommissionRow } from '@/lib/api/partner';

/**
 * The commission totals on the partner screen.
 *
 * Here for the reason `money.test.ts` and `account-stats.test.ts` are: every
 * wrong answer below renders perfectly. A float sum is right to the cent and
 * wrong in the eighth decimal; a merged currency total is a plausible number
 * that describes nothing; a reversed entry counted as released is money the
 * partner will look for and not find.
 *
 * Mutation-checked when written — each guarantee was broken in turn and the
 * named test failed on the right assertion.
 */

function row(over: Partial<IbCommissionRow>): IbCommissionRow {
  return {
    id: 'a',
    clientName: 'Client',
    source: 'position',
    baseAmount: '0',
    rateValue: '70.0000',
    amount: '0',
    currency: 'USD',
    status: 'confirmed',
    depth: 1,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

describe('summariseCommissions — the arithmetic', () => {
  /*
   * THE regression this file exists for. 0.1 + 0.2 is 0.30000000000000004 as
   * floats, and a partner reading their own total against the entries above it
   * is the person most likely to notice.
   */
  it('sums through decimal.js, not floats', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '0.10000000' }),
      row({ id: '2', amount: '0.20000000' }),
    ]);

    expect(usd?.released).toBe('0.30000000');
  });

  it('keeps every digit of a value a float would round', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '12345678901234567.89' }),
      row({ id: '2', amount: '0.01' }),
    ]);

    expect(usd?.released).toBe('12345678901234567.90000000');
  });

  /*
   * A malformed amount must not throw: `new Decimal('')` raises, and one bad
   * row taking the whole panel down is a worse failure than one row missing
   * from a total.
   */
  it('treats an unreadable amount as zero rather than throwing', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '25.00000000' }),
      row({ id: '2', amount: 'n/a' }),
    ]);

    expect(usd?.released).toBe('25.00000000');
    expect(usd?.counts.released).toBe(2);
  });
});

describe('summariseCommissions — what may never be added together', () => {
  /*
   * There is no FX source in this system. A USD total and a USDT total are two
   * facts, and one number claiming to be both is the failure `largestBalance`
   * on the dashboard exists to avoid.
   */
  it('never merges two currencies into one total', () => {
    const summaries = summariseCommissions([
      row({ id: '1', amount: '100.00000000', currency: 'USD' }),
      row({ id: '2', amount: '40.00000000', currency: 'USDT' }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => [s.currency, s.released])).toEqual([
      ['USD', '100.00000000'],
      ['USDT', '40.00000000'],
    ]);
  });

  /*
   * Sorted through decimal.js. As text '9' sorts above '100', which would put
   * the partner's smallest earning currency first on every visit.
   */
  it('leads with the largest released total, compared as a number', () => {
    const summaries = summariseCommissions([
      row({ id: '1', amount: '9.00000000', currency: 'EUR' }),
      row({ id: '2', amount: '100.00000000', currency: 'USD' }),
    ]);

    expect(summaries.map((s) => s.currency)).toEqual(['USD', 'EUR']);
  });
});

describe('summariseCommissions — the three statuses are three different facts', () => {
  it('counts only confirmed entries as released', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '10.00000000', status: 'confirmed' }),
      row({ id: '2', amount: '5.00000000', status: 'pending' }),
      row({ id: '3', amount: '3.00000000', status: 'reversed' }),
    ]);

    expect(usd?.released).toBe('10.00000000');
    expect(usd?.awaiting).toBe('5.00000000');
    expect(usd?.reversed).toBe('3.00000000');
  });

  /*
   * A reversal undoes an accrual that was never released. Subtracting it from
   * "released" understates money the partner is actually holding.
   */
  it('never nets a reversal off the released total', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '10.00000000', status: 'confirmed' }),
      row({ id: '2', amount: '10.00000000', status: 'reversed' }),
    ]);

    expect(usd?.released).toBe('10.00000000');
  });

  it('splits released commission by whether it came through a sub-partner', () => {
    const [usd] = summariseCommissions([
      row({ id: '1', amount: '10.00000000', depth: 1 }),
      row({ id: '2', amount: '4.00000000', depth: 2 }),
      // Pending is not a source of anything yet, so it stays out of the split.
      row({ id: '3', amount: '99.00000000', depth: 2, status: 'pending' }),
    ]);

    expect(usd?.directReleased).toBe('10.00000000');
    expect(usd?.networkReleased).toBe('4.00000000');
  });
});
