import Decimal from 'decimal.js';
import type { AccountStats } from './api/trading';

/**
 * The two derivations on the account statistics panel, kept out of the JSX.
 *
 * Both have an obvious wrong answer that renders perfectly, which is the whole
 * reason they are here rather than inline: a win rate off by a few points and a
 * P/L coloured the wrong way both look exactly like working code.
 */

/**
 * Closed trades that made money, as a percentage of ALL closed trades.
 *
 * ## The denominator is `trades`, never `wins + losses`
 *
 * A trade closing at exactly zero is neither a win nor a loss, and that is
 * ordinary rather than a rounding artefact — a scratch exit, or a position
 * closed at entry. Dividing by `wins + losses` silently drops those from the
 * denominator, so an account with 8 wins, 2 losses and 10 scratches reports 80%
 * when the honest figure is 40%. The two agree on most accounts, which is what
 * makes the wrong one survive review.
 *
 * ## Null with no trades, never zero
 *
 * "0% of no trades" is a statement about performance that has not happened.
 * The panel renders the null as an em dash, the same way the wallet renders a
 * currency that has not been opened — a figure nobody has earned yet is not a
 * figure of zero.
 *
 * Plain integer arithmetic is correct here: these are COUNTS, not money. §6.1
 * governs decimal strings from NUMERIC columns, and a count of trades is
 * neither.
 *
 * ## The parameter type is the real guard, and it is narrow on purpose
 *
 * `Pick<…, 'trades' | 'wins'>` rather than the whole `AccountStats`, so
 * `losses` is not in scope and the wrong denominator cannot be written here at
 * all. Widening this signature for convenience puts the bug back within reach —
 * the test below pins the arithmetic, but a type that makes a mistake
 * unrepresentable beats a test that catches it.
 */
export function winRate(stats: Pick<AccountStats, 'trades' | 'wins'>): number | null {
  if (stats.trades <= 0) return null;
  return (stats.wins / stats.trades) * 100;
}

/**
 * Which way a signed money string points — what colours a P/L figure.
 *
 * ## decimal.js, and NOT `compareMoney`
 *
 * `compareMoney` is the right tool for SORTING and the wrong one here, because
 * its fallback is deliberately a text comparison: an unparseable value must not
 * take down a render of a list. Applied to a sign that fallback is worse than
 * throwing — `compareMoney('unavailable', '0')` returns a positive number, and
 * a garbage value would render in profit green with a plus in front of it.
 *
 * So this parses directly and treats anything it cannot read as `zero`, which
 * is the one answer that claims nothing. `formatMoney` independently renders
 * the same value as an em dash, so the row reads "no figure" in both places
 * rather than "a gain of —".
 *
 * `Number(value) > 0` is banned on this path and would be wrong anyway in the
 * case that matters: `'-0.00000001'` is a real loss on an eight-decimal column
 * and rounds to `-0` through a float. `'0'`, `'0.00'` and `'0.00000000'` all
 * read as zero, because the API's spelling of zero is not fixed.
 */
export type MoneySign = 'positive' | 'negative' | 'zero';

export function moneySign(value: string): MoneySign {
  let parsed: Decimal;
  try {
    parsed = new Decimal(value);
  } catch {
    return 'zero';
  }
  if (!parsed.isFinite()) return 'zero';

  if (parsed.isPositive() && !parsed.isZero()) return 'positive';
  if (parsed.isNegative() && !parsed.isZero()) return 'negative';
  return 'zero';
}

/**
 * A timestamp on an account screen, in the reader's own zone, 24-hour clock.
 *
 * ## The bug this closes: an invisible day boundary
 *
 * A bare `toLocaleString()` gave `8/15/2026, 1:30:00 AM` directly above
 * `8/14/2026, 11:41:21 PM`. Both correct, and the newest-first ordering correct
 * — but read down the column, `11:41 PM` sits BELOW `1:30 AM` and looks like a
 * sorting bug, because the only thing separating the two days is a date prefix
 * in the same weight and colour as everything else. On the account that exposed
 * this, seven of ten rows crossed midnight and the column read as scrambled.
 *
 * A 24-hour clock removes the AM/PM inversion outright: `01:30` and `23:41` sort
 * visually the way they sort chronologically. The short month name does the rest
 * — `15 Aug` is a different SHAPE from `14 Aug`, where `8/15` and `8/14` differ
 * by one glyph buried in the middle of a number.
 *
 * ## The ZONE is deliberately not forced
 *
 * The API sends UTC and the browser renders in the reader's zone — `00:51Z` is
 * `03:51` in Asia/Beirut. That is what a client wants: their deals stamped in
 * the time they were placed, matching the clock on the wall and the MT5 terminal
 * beside it. Forcing UTC would make every row disagree with both.
 *
 * ## Shared because it was three copies
 *
 * `account-activity`, `account-positions` and `account-transactions` each had
 * this function, identical and private. Three copies of one formatting decision
 * is how two screens keep the bug after the third is fixed.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which yields `24:30` for
 * midnight in several locales.
 */
const DEAL_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};

export function formatDealTime(value: string, fallback: string): string {
  const date = new Date(value);
  // Guarded: an unparseable timestamp from the API must render as "unknown"
  // rather than the literal string `Invalid Date` in a client's history.
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString(undefined, DEAL_TIME_FORMAT);
}
