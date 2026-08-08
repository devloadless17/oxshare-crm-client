import { describe, expect, it } from 'vitest';
import { hasActiveFilters, INITIAL_FILTERS, toQuery, type Filters } from './transaction-filters';

/**
 * The toolbar's translation to the API's query parameters.
 *
 * ## What these tests are now, and what they used to be
 *
 * They used to cover `applyFilters`, `sortRows` and `paginate` — narrowing,
 * ordering and paging performed in the BROWSER. All three are gone: the endpoint
 * capped its array at 100 rows, so filtering it client-side under-reported the
 * history of any client past that, and the database does the work now.
 *
 * The money assertions went with them and are not lost. Ordering amounts is
 * `ORDER BY amount` on a `NUMERIC(28,8)` column — Postgres compares it exactly,
 * so the '9.00' above '100.00' trap the old comparator existed to avoid cannot
 * be reached from here at all. That guarantee moved to where the sort happens.
 *
 * What is left is small and still worth pinning, because it has a wrong answer
 * that fails at RUNTIME rather than in the type system: `'all'` must become an
 * ABSENT parameter. Sent as `state=` it reaches the API as an empty string,
 * fails `@IsIn`, and the client gets a 400 on their own transaction history.
 *
 * Mutation-checked when written: `undefined` was replaced with `''` and with
 * the literal `'all'`, and the named tests below failed on each.
 */

const base: Filters = INITIAL_FILTERS;

describe('toQuery', () => {
  /*
   * ⚠️ THE regression. Every one of these is `'all'` by default, so a mapping
   * that passed the sentinel through would send four invalid parameters on the
   * very first render of the screen.
   */
  it('omits every filter that is set to "all"', () => {
    const query = toQuery(base);

    expect(query.direction).toBeUndefined();
    expect(query.state).toBeUndefined();
    expect(query.currency).toBeUndefined();
    // Not an empty string — that is the shape the API refuses.
    expect(Object.values(query).every((value) => value !== '' && value !== 'all')).toBe(true);
  });

  it('passes a chosen filter through unchanged', () => {
    const query = toQuery({
      ...base,
      direction: 'withdrawal',
      state: 'pending',
      currency: 'USDT',
    });

    expect(query).toMatchObject({
      direction: 'withdrawal',
      state: 'pending',
      currency: 'USDT',
    });
  });

  /*
   * The range crosses the wire as the `YYYY-MM-DD` strings `date-range.ts`
   * already holds — never re-derived through a Date.
   *
   * `toISOString().split('T')[0]` is the trap: it converts to UTC first, so an
   * evening selection in an eastern zone would be sent as tomorrow and the
   * client's newest transaction would fall outside their own filter.
   */
  it('sends the date range as the literal YYYY-MM-DD strings', () => {
    const query = toQuery({ ...base, range: { from: '2026-08-01', to: '2026-08-31' } });

    expect(query.from).toBe('2026-08-01');
    expect(query.to).toBe('2026-08-31');
  });

  it('omits an unset half of the range rather than sending null', () => {
    const query = toQuery({ ...base, range: { from: '2026-08-01', to: null } });

    expect(query.from).toBe('2026-08-01');
    expect(query.to).toBeUndefined();
  });
});

describe('hasActiveFilters', () => {
  /* Drives whether "Clear" is offered. A permanently visible Clear on an
     untouched toolbar is a control that does nothing; one that stays hidden
     while a filter is set leaves the client no way back to their full history. */
  it('is false for the untouched toolbar', () => {
    expect(hasActiveFilters(base)).toBe(false);
  });

  it('is true for any single filter, including one half of a date range', () => {
    expect(hasActiveFilters({ ...base, direction: 'deposit' })).toBe(true);
    expect(hasActiveFilters({ ...base, state: 'pending' })).toBe(true);
    expect(hasActiveFilters({ ...base, currency: 'USD' })).toBe(true);
    expect(hasActiveFilters({ ...base, range: { from: '2026-08-01', to: null } })).toBe(true);
    expect(hasActiveFilters({ ...base, range: { from: null, to: '2026-08-31' } })).toBe(true);
  });
});
