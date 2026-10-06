/**
 * The date arithmetic behind the range picker, with no React in it.
 *
 * ## Why this is a separate module
 *
 * Every function here has a wrong answer that only shows up at a boundary — the
 * last day of a month, a range selected backwards, a timezone west of UTC — and
 * those are precisely the cases that are tedious to reach by clicking. Pure
 * functions make them one assertion each.
 *
 * ## Dates are `YYYY-MM-DD` STRINGS, not `Date` objects
 *
 * A calendar day is not an instant. `new Date('2026-08-07')` parses as UTC
 * midnight, so a client in UTC-5 renders it as 7 PM on the 6th — the filter
 * would silently drop a day at one end of the range. Keeping the wire format as
 * a plain date string means the only place a timezone can intrude is where a
 * real timestamp is compared, and `withinRange` handles that explicitly.
 *
 * This mirrors how money is handled in this codebase: the value stays in its
 * exact string form and is converted only at the point of use, because the
 * convenient type loses information the string does not.
 */

/** A calendar day as `YYYY-MM-DD`. */
export type IsoDate = string;

export interface DateRange {
  from: IsoDate | null;
  to: IsoDate | null;
}

export const EMPTY_RANGE: DateRange = { from: null, to: null };

/**
 * A calendar day for one cell of a month grid.
 *
 * `iso` is the value; the flags are everything the cell needs to style itself
 * without recomputing dates during render.
 */
export interface CalendarDay {
  iso: IsoDate;
  dayOfMonth: number;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
  isToday: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  /** Strictly between start and end — the cells that get the connecting wash. */
  isInRange: boolean;
  /** Beyond `maxDate`/`minDate`, so not selectable. */
  disabled: boolean;
}

/**
 * Today as a local `YYYY-MM-DD`.
 *
 * Built from the LOCAL getters rather than `toISOString().split('T')[0]`. That
 * idiom is the single most common source of off-by-one-day bugs in date UI: it
 * converts to UTC first, so for anyone east of UTC after their evening it
 * returns tomorrow, and for anyone west of it before their morning, yesterday.
 */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `YYYY-MM-DD` from local year/month/day parts. `month` is 0-indexed. */
export function toIso(year: number, month: number, day: number): IsoDate {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Split `YYYY-MM-DD` into local parts. Returns null for anything malformed. */
export function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  /*
   * Round-tripped through a local Date to reject impossible days — '2026-02-31'
   * matches the pattern but is not a date. Constructing with local parts (not
   * `new Date(string)`) keeps this in local time, where the rest of the module
   * lives.
   */
  const probe = new Date(year, month, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month || probe.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/**
 * String comparison, which is CORRECT for this format and not a shortcut.
 *
 * `YYYY-MM-DD` is fixed-width and big-endian, so lexicographic order IS
 * chronological order. Parsing both sides into `Date` objects to compare them
 * would add two timezone conversions to answer a question that does not involve
 * time at all.
 */
export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

/**
 * A range with its ends the right way round.
 *
 * Selecting backwards — clicking the 20th and then the 5th — is a normal thing
 * to do and must not produce a range that matches nothing. Normalising here
 * rather than refusing the second click means the picker never has to explain
 * itself for something the user did not get wrong.
 */
export function normalizeRange(range: DateRange): DateRange {
  const { from, to } = range;
  if (from && to && isBefore(to, from)) return { from: to, to: from };
  return range;
}

/**
 * How a click updates the selection.
 *
 * The standard two-click cycle: the first click sets a new start and clears the
 * end, the second completes the range. Once both ends are set, the next click
 * starts over — which is what makes a picker feel predictable, because there is
 * never a hidden third state.
 *
 * Returns a NEW range rather than mutating, so a caller can hold the pending
 * selection in state without an aliasing bug.
 */
export function applyDayClick(current: DateRange, day: IsoDate): DateRange {
  const bothSet = current.from !== null && current.to !== null;
  if (bothSet || current.from === null) return { from: day, to: null };
  return normalizeRange({ from: current.from, to: day });
}

/**
 * Does a TIMESTAMP fall inside a calendar-day range, inclusive at both ends?
 *
 * ## The inclusive-end rule, which is where these filters usually go wrong
 *
 * A transaction stamped `2026-08-07T16:40:00Z` must match a range ending on
 * `2026-08-07`. Comparing the timestamp against the end date parsed as midnight
 * excludes almost the whole final day — the classic "my newest row vanished when
 * I set an end date" bug. Comparing only the DATE PART of the timestamp against
 * the two bounds sidesteps it entirely, with no end-of-day arithmetic.
 *
 * The timestamp's date part is taken in LOCAL time, because that is the day the
 * client sees printed in the row beside it. Using the UTC date here would mean a
 * row displayed as the 7th failing a filter for the 7th.
 */
export function withinRange(timestamp: string, range: DateRange): boolean {
  if (!range.from && !range.to) return true;

  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) {
    /*
     * An unparseable timestamp is KEPT rather than filtered out. Hiding a row
     * because its date could not be read would silently shorten a client's own
     * financial history — the one list where an omission is worse than an
     * oddity.
     */
    return true;
  }

  const day = toIso(at.getFullYear(), at.getMonth(), at.getDate());
  if (range.from && isBefore(day, range.from)) return false;
  if (range.to && isBefore(range.to, day)) return false;
  return true;
}

/**
 * The cells of one month's grid, padded to whole weeks.
 *
 * `weekStartsOn` defaults to Monday (1) because that is the convention across
 * this product's locales; Sunday (0) is supported so a future locale switch is a
 * parameter rather than a rewrite.
 *
 * Always emits 6 rows (42 cells). A grid that is 5 rows in one month and 6 in
 * the next changes height when you page between them, which moves the buttons
 * under the cursor — the same reason the admin data table pins its own height.
 */
export function buildMonth(
  year: number,
  month: number,
  options: {
    range: DateRange;
    today?: IsoDate;
    minDate?: IsoDate;
    maxDate?: IsoDate;
    weekStartsOn?: 0 | 1;
  },
): CalendarDay[] {
  const { range, minDate, maxDate } = options;
  const today = options.today ?? todayIso();
  const weekStartsOn = options.weekStartsOn ?? 1;

  const firstOfMonth = new Date(year, month, 1);
  // How many leading cells belong to the previous month.
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;

  const cells: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    /*
     * `new Date(year, month, n)` with n <= 0 or past the month end rolls over
     * correctly — including across year boundaries and leap days — which is why
     * the padding is generated this way rather than by computing the previous
     * month's length by hand.
     */
    const cellDate = new Date(year, month, index - offset + 1);
    const iso = toIso(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());

    const beforeMin = minDate !== undefined && isBefore(iso, minDate);
    const afterMax = maxDate !== undefined && isBefore(maxDate, iso);

    cells.push({
      iso,
      dayOfMonth: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month && cellDate.getFullYear() === year,
      isToday: iso === today,
      isRangeStart: range.from === iso,
      isRangeEnd: range.to === iso,
      isInRange:
        range.from !== null &&
        range.to !== null &&
        isBefore(range.from, iso) &&
        isBefore(iso, range.to),
      disabled: beforeMin || afterMax,
    });
  }
  return cells;
}

/** The month after this one, rolling the year over at December. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

/** The month before this one, rolling the year back at January. */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/**
 * Which month the calendar should open on.
 *
 * The range's start when there is one, so reopening the picker shows the
 * selection rather than making the user page back to find it. Today otherwise.
 */
export function initialMonth(
  range: DateRange,
  today: IsoDate = todayIso(),
): {
  year: number;
  month: number;
} {
  const anchor = parseIso(range.from ?? today) ?? parseIso(today);
  // `today` is generated by this module, so the second parse cannot fail — the
  // fallback exists to satisfy the type rather than to handle a real case.
  return { year: anchor?.year ?? new Date().getFullYear(), month: anchor?.month ?? 0 };
}

/**
 * The start of a LOCAL day as an instant with its offset
 * (`2026-10-06T00:00:00+03:00`) — what the API compares, so "the 6th" means the
 * client's 6th, not the server's. `nextDay` gives the start of the day AFTER,
 * the exclusive end of a range ending on `iso` (backend `common/date-range.ts`).
 */
export function dayStartInstant(iso: IsoDate, nextDay = false): string | undefined {
  const parts = parseIso(iso);
  if (!parts) return undefined;
  const date = new Date(parts.year, parts.month, parts.day + (nextDay ? 1 : 0));
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const day = toIso(date.getFullYear(), date.getMonth(), date.getDate());
  return `${day}T00:00:00${sign}${hh}:${mm}`;
}

/** The quick periods the picker offers — the admin console's vocabulary. */
export const RANGE_PRESETS = ['7d', '30d', 'thisMonth', 'lastMonth', '3m', 'thisYear'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** A preset as an inclusive local `[from, to]`, ending today. */
export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = (date: Date) => toIso(date.getFullYear(), date.getMonth(), date.getDate());
  const today = todayIso(now);
  switch (preset) {
    case '7d':
      return { from: iso(new Date(y, m, d - 6)), to: today };
    case '30d':
      return { from: iso(new Date(y, m, d - 29)), to: today };
    case 'thisMonth':
      return { from: iso(new Date(y, m, 1)), to: today };
    case 'lastMonth':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case '3m':
      return { from: iso(new Date(y, m - 3, d)), to: today };
    case 'thisYear':
      return { from: iso(new Date(y, 0, 1)), to: today };
  }
}
