'use client';

import Decimal from 'decimal.js';
import { HAIRLINE_GRID, Stat } from '@/components/partner/partner-ui';
import type { TransactionSummaryRow } from '@/lib/api/payments';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import type { HistoryScope } from '@/components/transactions/movement-history';

/**
 * The three figures above a history, per currency.
 *
 * Each scope asks its own three questions. Deposits and withdrawals: how much
 * went through, how much is still in flight, how many were turned down.
 * Transfers: how much went to trading, how much came back, what is processing.
 *
 * A currency with no movement in scope is not drawn — a row of three zeroes per
 * unused wallet is noise. With no movement at all nothing is drawn, and the
 * empty state below says so in words.
 */
export function SummaryTiles({
  scope,
  rows,
  failed,
}: {
  scope: HistoryScope;
  rows: TransactionSummaryRow[] | undefined;
  failed: boolean;
}) {
  if (failed) {
    return <p className="text-xs text-muted-foreground">{t('history.summaryUnavailable')}</p>;
  }
  if (!rows || rows.length === 0) return null;

  const byCurrency = new Map<string, TransactionSummaryRow[]>();
  for (const row of rows) {
    byCurrency.set(row.currency, [...(byCurrency.get(row.currency) ?? []), row]);
  }

  const sum = (cells: TransactionSummaryRow[]) =>
    cells.reduce(
      (acc, cell) => ({ total: acc.total.plus(cell.total), count: acc.count + cell.count }),
      { total: new Decimal(0), count: 0 },
    );
  const pick = (
    cells: TransactionSummaryRow[],
    states: string[],
    direction?: TransactionSummaryRow['direction'],
  ) =>
    sum(cells.filter((c) => states.includes(c.state) && (!direction || c.direction === direction)));

  return (
    <div className="space-y-3">
      {[...byCurrency.entries()].map(([currency, cells]) => {
        const money = (value: Decimal) => formatMoney(value.toFixed(8), currency);
        const stats =
          scope === 'transfers'
            ? (() => {
                const out = pick(cells, ['success'], 'withdrawal');
                const back = pick(cells, ['success'], 'deposit');
                const pending = pick(cells, ['pending', 'approved']);
                return [
                  {
                    label: t('history.statToAccounts'),
                    value: money(out.total),
                    hint: t('history.statCount', { count: out.count }),
                  },
                  {
                    label: t('history.statToWallet'),
                    value: money(back.total),
                    hint: t('history.statCount', { count: back.count }),
                  },
                  {
                    label: t('history.statProcessing'),
                    value: money(pending.total),
                    hint: t('history.statCount', { count: pending.count }),
                  },
                ];
              })()
            : (() => {
                const done = pick(cells, ['success']);
                const inFlight = pick(cells, ['pending', 'approved']);
                const refused = pick(cells, ['rejected', 'failure']);
                return [
                  {
                    label:
                      scope === 'deposits'
                        ? t('history.statDeposited')
                        : t('history.statWithdrawn'),
                    value: money(done.total),
                    hint: t('history.statCount', { count: done.count }),
                  },
                  {
                    label: t('history.statInProgress'),
                    value: money(inFlight.total),
                    hint: t('history.statCount', { count: inFlight.count }),
                  },
                  {
                    label: t('history.statDeclined'),
                    value: money(refused.total),
                    hint:
                      scope === 'withdrawals' && refused.count > 0
                        ? t('history.statRefunded', { count: refused.count })
                        : t('history.statCount', { count: refused.count }),
                  },
                ];
              })();

        return (
          <div
            key={currency}
            /* Phone: the headline figure full width, the other two beside each
               other — three stacked tiles push the table below the fold. */
            className={`${HAIRLINE_GRID} grid-cols-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1`}
          >
            {stats.map((stat) => (
              <Stat
                key={stat.label}
                label={byCurrency.size > 1 ? `${stat.label} · ${currency}` : stat.label}
                value={stat.value}
                hint={stat.hint}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
