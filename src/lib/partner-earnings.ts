import Decimal from 'decimal.js';
import type { IbCommissionRow } from '@/lib/api/partner';

/**
 * What a partner's commission entries add up to.
 *
 * ## Why this is a module and not four `reduce`s inside the tab
 *
 * Every figure here is money, and every one of them has a wrong version that
 * renders perfectly: a float sum that drifts in the eighth decimal, a total that
 * quietly adds USD to USDT, a "released" figure that counts a reversed entry.
 * None of those throws and none is visible in review — the same class of bug
 * `lib/account-stats.ts` and `lib/date-range.ts` were pulled out for, and pinned
 * the same way in `partner-earnings.test.ts`.
 *
 * ## These totals describe THE ROWS THEY WERE GIVEN, and nothing more
 *
 * `GET /ib/commissions` returns the partner's most recent entries, newest
 * first, and takes no query parameters — the server caps the list. So a sum over
 * them is a sum over *the entries in the list*, which is NOT the same claim as
 * "everything you have ever earned".
 *
 * That distinction is why the screen labels these totals as covering the entries
 * shown and puts the lifetime figure — which the server sums over the whole
 * ledger, in the database — somewhere else entirely. Presenting a bounded sum as
 * a lifetime total is the partner-facing version of filtering one page of
 * transactions and calling it a filter over the history.
 *
 * ## Currencies never merge
 *
 * One summary PER CURRENCY, always, even when there is only ever one in
 * practice. There is no FX source in this system, so $500 + 200 USDT is not
 * "700" of anything — the same constraint that stops `largestBalance` on the
 * dashboard from being a sum.
 */
export interface CommissionSummary {
  currency: string;
  /** `confirmed` rows: money that has actually been credited to the wallet. */
  released: string;
  /** `pending` rows: earned, not yet credited — what the partner is owed. */
  awaiting: string;
  /** `reversed` rows: withdrawn again before release. Never nets off the others. */
  reversed: string;
  /** Released commission earned from this partner's OWN clients (depth 1). */
  directReleased: string;
  /** Released commission earned through the partners beneath them (depth > 1). */
  networkReleased: string;
  counts: { total: number; released: number; awaiting: number; reversed: number };
}

/** The canonical money shape this API emits — `'0.00000000'`, never `'0'`. */
const SCALE = 8;

/**
 * Group the entries by currency and total each group by status.
 *
 * Sorted by released amount, largest first, so the currency a partner actually
 * earns in leads — compared through decimal.js, because `'9.00'` sorts above
 * `'100.00'` as text and a float has already lost precision before the
 * comparison happens (`lib/money.ts` records both).
 *
 * An unparseable amount is treated as ZERO rather than skipped or thrown on: a
 * malformed row must not be able to blank the whole panel, and a total that
 * silently grows by a garbage value is worse than one that ignores it. This has
 * never fired in practice — the API emits NUMERIC(28,8) as text — and exists so
 * that if it ever does, the failure is a figure that is too small rather than a
 * screen that is empty.
 */
export function summariseCommissions(rows: IbCommissionRow[]): CommissionSummary[] {
  const groups = new Map<string, CommissionSummary>();

  for (const row of rows) {
    const summary = groups.get(row.currency) ?? blank(row.currency);
    const amount = decimalOf(row.amount);

    summary.counts.total += 1;

    if (row.status === 'confirmed') {
      summary.released = add(summary.released, amount);
      summary.counts.released += 1;
      // Depth 1 is the partner's own client; anything deeper reached them
      // through a sub-partner. Split on RELEASED only — a pending accrual is
      // not yet a source of anything, and mixing the two would produce a
      // "where your money comes from" panel that includes money nobody has.
      if (row.depth > 1) summary.networkReleased = add(summary.networkReleased, amount);
      else summary.directReleased = add(summary.directReleased, amount);
    } else if (row.status === 'pending') {
      summary.awaiting = add(summary.awaiting, amount);
      summary.counts.awaiting += 1;
    } else {
      /*
       * Reversed is its OWN total and is never subtracted from the others.
       *
       * A reversal undoes an accrual that was never released, so netting it off
       * "released" would understate money the partner actually holds — and
       * netting it off "awaiting" would make a reversal look like it had
       * cancelled a different, still-good entry.
       */
      summary.reversed = add(summary.reversed, amount);
      summary.counts.reversed += 1;
    }

    groups.set(row.currency, summary);
  }

  return [...groups.values()].sort((a, b) =>
    new Decimal(b.released).comparedTo(new Decimal(a.released)),
  );
}

function blank(currency: string): CommissionSummary {
  const zero = new Decimal(0).toFixed(SCALE);
  return {
    currency,
    released: zero,
    awaiting: zero,
    reversed: zero,
    directReleased: zero,
    networkReleased: zero,
    counts: { total: 0, released: 0, awaiting: 0, reversed: 0 },
  };
}

function add(total: string, amount: Decimal): string {
  return new Decimal(total).plus(amount).toFixed(SCALE);
}

/**
 * `Decimal`, or zero for anything decimal.js cannot read.
 *
 * `new Decimal('abc')` THROWS rather than producing NaN, which on a money panel
 * means one bad row takes the whole tab down with it.
 */
function decimalOf(value: string): Decimal {
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}
