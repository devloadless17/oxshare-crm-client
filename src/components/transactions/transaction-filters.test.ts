import { describe, expect, it } from 'vitest';
import { applyFilters, INITIAL_FILTERS, type Filters } from './transaction-filters';
import type { Transaction } from '@/lib/api/payments';

/**
 * The narrowing and ordering behind the transactions screen.
 *
 * The assertions that earn their runtime are the money ones. Sorting decimal
 * STRINGS is where this screen has a wrong answer that looks right: both
 * `Number(a) - Number(b)` and `a.localeCompare(b)` produce a plausible-looking
 * ordering that is incorrect for values a real client actually holds, and
 * neither throws. A test asserting "the filter returns fewer rows" would prove
 * nothing.
 *
 * Mutation-checked when written: the money comparator was swapped for a text
 * compare and for a `Number()` subtraction, and the named tests below failed on
 * each.
 */

/** A transaction with only the fields the filters read. */
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'user-1',
    walletId: 'wallet-1',
    direction: 'deposit',
    amount: '100.00000000',
    currency: 'USD',
    state: 'success',
    provider: 'manual',
    providerRef: null,
    destination: null,
    rejectionReason: null,
    createdAt: new Date(2026, 7, 7, 12, 0, 0).toISOString(),
    ...overrides,
  } as Transaction;
}

const base: Filters = INITIAL_FILTERS;

describe('applyFilters — money ordering', () => {
  /*
   * THE regression. A plain string compare puts '9' above '100' because it
   * compares '9' against '1' character by character. Every client holding both
   * a two-figure and a three-figure transaction hits this on the first sort.
   */
  it('orders amounts numerically, not as text', () => {
    const rows = [
      tx({ amount: '9.00000000' }),
      tx({ amount: '100.00000000' }),
      tx({ amount: '25.00000000' }),
    ];

    const sorted = applyFilters(rows, { ...base, sort: 'amountDesc' });
    expect(sorted.map((row) => row.amount)).toEqual(['100.00000000', '25.00000000', '9.00000000']);
  });

  /*
   * Beyond IEEE-754's exact integer range, so `Number()` collapses these two
   * distinct amounts to the same value and the comparison returns 0 — leaving
   * the order to whatever the sort algorithm happened to do.
   */
  it('distinguishes amounts that a float would collapse', () => {
    const rows = [tx({ amount: '12345678901234567.89' }), tx({ amount: '12345678901234567.88' })];

    const sorted = applyFilters(rows, { ...base, sort: 'amountAsc' });
    expect(sorted.map((row) => row.amount)).toEqual([
      '12345678901234567.88',
      '12345678901234567.89',
    ]);
  });

  it('orders by date newest-first by default', () => {
    const older = tx({ createdAt: new Date(2026, 6, 1, 9, 0, 0).toISOString() });
    const newer = tx({ createdAt: new Date(2026, 7, 20, 9, 0, 0).toISOString() });

    const sorted = applyFilters([older, newer], base);
    expect(sorted[0]).toBe(newer);
  });

  /*
   * `Array.prototype.sort` mutates. `rows` is React Query's cached array, so
   * sorting in place would reorder the cache and make the next render depend on
   * whichever sort was applied last.
   */
  it('does not reorder the array it was given', () => {
    const rows = [tx({ amount: '9.00000000' }), tx({ amount: '100.00000000' })];
    const snapshot = [...rows];

    applyFilters(rows, { ...base, sort: 'amountDesc' });
    expect(rows).toEqual(snapshot);
  });
});

describe('applyFilters — narrowing', () => {
  it('filters by direction, state and currency independently', () => {
    const rows = [
      tx({ direction: 'deposit', state: 'success', currency: 'USD' }),
      tx({ direction: 'withdrawal', state: 'pending', currency: 'USDT' }),
    ];

    expect(applyFilters(rows, { ...base, direction: 'withdrawal' })).toHaveLength(1);
    expect(applyFilters(rows, { ...base, state: 'pending' })).toHaveLength(1);
    expect(applyFilters(rows, { ...base, currency: 'USD' })).toHaveLength(1);
  });

  /*
   * Searched against the RAW amount, because `formatMoney` would render this as
   * "$1,234.00" — so matching the formatted text would make the digits a client
   * reads off their own screen fail to find the row.
   */
  it('searches the raw amount, not the formatted one', () => {
    const rows = [tx({ amount: '1234.00000000' }), tx({ amount: '99.00000000' })];
    expect(applyFilters(rows, { ...base, search: '1234' })).toHaveLength(1);
  });

  it('searches the provider reference case-insensitively', () => {
    const rows = [tx({ providerRef: 'TXN-ABC-991' }), tx({ providerRef: 'TXN-XYZ-002' })];
    expect(applyFilters(rows, { ...base, search: 'abc' })).toHaveLength(1);
  });

  /*
   * The date filter must be inclusive at BOTH ends — a transaction stamped late
   * on the closing day is exactly the row a client is looking for when they set
   * that end date. `withinRange` owns the rule; this asserts it is actually
   * wired into the filter rather than merely existing.
   */
  it('includes a transaction stamped late on the range end date', () => {
    const rows = [tx({ createdAt: new Date(2026, 7, 7, 23, 50, 0).toISOString() })];
    const filtered = applyFilters(rows, {
      ...base,
      range: { from: '2026-08-01', to: '2026-08-07' },
    });
    expect(filtered).toHaveLength(1);
  });

  it('excludes a transaction outside the range', () => {
    const rows = [tx({ createdAt: new Date(2026, 7, 9, 12, 0, 0).toISOString() })];
    const filtered = applyFilters(rows, {
      ...base,
      range: { from: '2026-08-01', to: '2026-08-07' },
    });
    expect(filtered).toHaveLength(0);
  });

  it('combines filters as AND rather than OR', () => {
    const rows = [
      tx({ direction: 'deposit', currency: 'USD' }),
      tx({ direction: 'deposit', currency: 'USDT' }),
      tx({ direction: 'withdrawal', currency: 'USD' }),
    ];

    const filtered = applyFilters(rows, { ...base, direction: 'deposit', currency: 'USD' });
    expect(filtered).toHaveLength(1);
  });

  it('returns everything when nothing is set', () => {
    const rows = [tx({}), tx({}), tx({})];
    expect(applyFilters(rows, base)).toHaveLength(3);
  });
});
