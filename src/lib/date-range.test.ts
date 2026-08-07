import { describe, expect, it } from 'vitest';
import {
  applyDayClick,
  buildMonth,
  normalizeRange,
  parseIso,
  todayIso,
  withinRange,
} from './date-range';

/**
 * The date arithmetic behind the transactions range filter.
 *
 * Every assertion here is a case with a WRONG answer that ships silently: an
 * inclusive end date that drops the newest row, a range selected backwards that
 * matches nothing, a UTC conversion that shifts the day for half the world. None
 * of them throw — they just quietly return the wrong set, on a screen a client
 * uses to audit their own money.
 *
 * Mutation-checked when written: each guarantee below was deliberately broken
 * and the named test failed. A test asserting `parseIso('2026-08-07')` is
 * truthy would prove nothing, so none of those are here.
 */

describe('withinRange — the inclusive-end rule', () => {
  /*
   * THE regression this file exists for.
   *
   * A transaction stamped late in the day must match a range ending on that
   * day. The naive implementation compares the timestamp against the end date
   * parsed as midnight, which excludes almost the entire final day — the
   * "my newest transaction vanished when I set an end date" bug.
   *
   * Deliberately uses a LATE local time, because midnight-plus-a-minute would
   * pass even against the broken comparison.
   */
  it('includes a transaction stamped late on the final day of the range', () => {
    const lateOnTheSeventh = new Date(2026, 7, 7, 23, 45, 0).toISOString();
    expect(withinRange(lateOnTheSeventh, { from: '2026-08-01', to: '2026-08-07' })).toBe(true);
  });

  it('includes a transaction stamped at the very start of the first day', () => {
    const startOfTheFirst = new Date(2026, 7, 1, 0, 0, 0).toISOString();
    expect(withinRange(startOfTheFirst, { from: '2026-08-01', to: '2026-08-07' })).toBe(true);
  });

  it('excludes the day either side of the range', () => {
    const dayBefore = new Date(2026, 6, 31, 12, 0, 0).toISOString();
    const dayAfter = new Date(2026, 7, 8, 12, 0, 0).toISOString();
    const range = { from: '2026-08-01', to: '2026-08-07' };

    expect(withinRange(dayBefore, range)).toBe(false);
    expect(withinRange(dayAfter, range)).toBe(false);
  });

  it('treats an open end as unbounded in that direction', () => {
    const stamp = new Date(2027, 0, 1, 12, 0, 0).toISOString();
    expect(withinRange(stamp, { from: '2026-08-01', to: null })).toBe(true);
    expect(withinRange(stamp, { from: null, to: '2026-08-01' })).toBe(false);
  });

  it('matches everything when no range is set', () => {
    const stamp = new Date(2026, 7, 7, 12, 0, 0).toISOString();
    expect(withinRange(stamp, { from: null, to: null })).toBe(true);
  });

  /*
   * An unreadable timestamp KEEPS the row.
   *
   * Filtering it out would silently shorten a client's own financial history,
   * and an omission there is worse than an oddly-placed row. This is the
   * assertion that fails if someone "tidies up" the guard into a `return false`.
   */
  it('keeps a row whose timestamp cannot be parsed rather than hiding it', () => {
    expect(withinRange('not-a-date', { from: '2026-08-01', to: '2026-08-07' })).toBe(true);
  });
});

describe('normalizeRange — a range selected backwards', () => {
  /*
   * Clicking the 20th and then the 5th is a normal thing to do. Without this
   * the range is `from: 20th, to: 5th`, which matches NOTHING — the filter
   * appears broken rather than the selection being reinterpreted.
   */
  it('swaps the ends when they arrive reversed', () => {
    expect(normalizeRange({ from: '2026-08-20', to: '2026-08-05' })).toEqual({
      from: '2026-08-05',
      to: '2026-08-20',
    });
  });

  it('leaves an already-ordered range untouched', () => {
    const ordered = { from: '2026-08-05', to: '2026-08-20' };
    expect(normalizeRange(ordered)).toEqual(ordered);
  });
});

describe('applyDayClick — the two-click cycle', () => {
  it('starts a new range on the first click, clearing any end', () => {
    expect(applyDayClick({ from: null, to: null }, '2026-08-05')).toEqual({
      from: '2026-08-05',
      to: null,
    });
  });

  it('completes the range on the second click', () => {
    expect(applyDayClick({ from: '2026-08-05', to: null }, '2026-08-20')).toEqual({
      from: '2026-08-05',
      to: '2026-08-20',
    });
  });

  it('normalises when the second click is before the first', () => {
    expect(applyDayClick({ from: '2026-08-20', to: null }, '2026-08-05')).toEqual({
      from: '2026-08-05',
      to: '2026-08-20',
    });
  });

  /*
   * A third click STARTS OVER rather than extending. Without this the picker
   * has a hidden third state and the user cannot tell which end their next
   * click will move.
   */
  it('restarts once both ends are set', () => {
    expect(applyDayClick({ from: '2026-08-05', to: '2026-08-20' }, '2026-08-25')).toEqual({
      from: '2026-08-25',
      to: null,
    });
  });
});

describe('parseIso — rejecting impossible dates', () => {
  /*
   * '2026-02-31' matches the shape and is not a date. Without the round-trip
   * check, `new Date(2026, 1, 31)` rolls over to 3 March and the calendar
   * silently jumps a month.
   */
  it('rejects a day that does not exist in its month', () => {
    expect(parseIso('2026-02-31')).toBeNull();
    expect(parseIso('2026-04-31')).toBeNull();
  });

  it('accepts a real leap day and rejects a false one', () => {
    expect(parseIso('2024-02-29')).toEqual({ year: 2024, month: 1, day: 29 });
    expect(parseIso('2026-02-29')).toBeNull();
  });

  it('rejects malformed input rather than guessing', () => {
    expect(parseIso('2026-8-7')).toBeNull();
    expect(parseIso('07/08/2026')).toBeNull();
    expect(parseIso('')).toBeNull();
  });
});

describe('todayIso — local, not UTC', () => {
  /*
   * `toISOString().split('T')[0]` is the idiom this replaces, and it returns
   * the WRONG DAY for anyone whose local date differs from the UTC date at the
   * moment of the call — tomorrow for eastern zones in the evening, yesterday
   * for western zones in the morning.
   *
   * Asserted against local getters rather than a fixed string so the test is
   * correct in whichever timezone it runs.
   */
  it('reports the local calendar day', () => {
    const at = new Date(2026, 7, 7, 23, 30, 0);
    expect(todayIso(at)).toBe('2026-08-07');
  });

  it('does not roll forward late in the evening', () => {
    const lateEvening = new Date(2026, 11, 31, 23, 59, 0);
    expect(todayIso(lateEvening)).toBe('2026-12-31');
  });
});

describe('buildMonth', () => {
  const range = { from: null, to: null };

  /*
   * A fixed 42 cells. A grid that is 5 rows one month and 6 the next changes
   * height when paging, which moves the navigation buttons under the cursor
   * mid-click.
   */
  it('always emits six whole weeks', () => {
    expect(buildMonth(2026, 7, { range })).toHaveLength(42);
    // February 2026 starts on a Sunday and would otherwise need fewer rows.
    expect(buildMonth(2026, 1, { range })).toHaveLength(42);
  });

  it('marks only the days belonging to the month', () => {
    const cells = buildMonth(2026, 7, { range });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it('pads across a year boundary without breaking', () => {
    const january = buildMonth(2026, 0, { range });
    // The leading padding must come from December of the PREVIOUS year.
    expect(january[0]?.iso.startsWith('2025-12')).toBe(true);
    expect(january.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it('flags the range ends and the days strictly between them', () => {
    const cells = buildMonth(2026, 7, {
      range: { from: '2026-08-05', to: '2026-08-08' },
    });

    const start = cells.find((cell) => cell.iso === '2026-08-05');
    const middle = cells.find((cell) => cell.iso === '2026-08-06');
    const end = cells.find((cell) => cell.iso === '2026-08-08');

    expect(start?.isRangeStart).toBe(true);
    // The ends are NOT also "in range" — they carry their own styling, and
    // double-marking them would paint the connector over the end caps.
    expect(start?.isInRange).toBe(false);
    expect(middle?.isInRange).toBe(true);
    expect(end?.isRangeEnd).toBe(true);
  });

  it('disables days beyond maxDate', () => {
    const cells = buildMonth(2026, 7, { range, maxDate: '2026-08-07' });
    expect(cells.find((cell) => cell.iso === '2026-08-07')?.disabled).toBe(false);
    expect(cells.find((cell) => cell.iso === '2026-08-08')?.disabled).toBe(true);
  });
});
