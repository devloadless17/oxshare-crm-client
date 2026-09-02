'use client';

import * as React from 'react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Tabs, type TabDefinition } from '@/components/ui/tabs';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type AccountStats } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { formatDealTime, moneySign, winRate } from '@/lib/account-stats';
import { todayIso } from '@/lib/date-range';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * How this account has PERFORMED over a period: the trading statistics.
 *
 * ## The deal list under these figures was removed deliberately
 *
 * This card used to carry an "Account history" table of every MT5 deal in the
 * window beneath the stat cards. It is gone because it was the third list on one
 * screen and the two beside it answer the questions a client actually opens this
 * page with: "Deposits and withdrawals" shows the money in and out, and "Open
 * positions" shows what is running right now.
 *
 * **Know what went with it.** A client can no longer see their individual CLOSED
 * TRADES anywhere in the portal — only the totals computed from them. That is a
 * real loss and it was an accepted one, not an oversight, so anybody reading a
 * stat card and looking for the rows behind it is not missing a bug.
 *
 * `GET /trading/accounts/:id/history` still RETURNS those deals; the server
 * computes the statistics from exactly the array it sends. Nothing renders it
 * now, so the response carries rows this screen drops on the floor — which is
 * the argument for a stats-only variant of that endpoint if the payload ever
 * starts to matter.
 *
 * ## This is the CRM's own record, not a live MT5 read
 *
 * The endpoint serves `mt5_deals` — every deal the bridge has ingested, by
 * ticket. It used to read the trading server on each view, and moving it here
 * changed what this panel promises:
 *
 * - A trade that closed MINUTES ago may not be counted yet. Ingestion is a live
 *   push plus a sweep every five minutes, so the lag is small and real.
 * - Nothing here breaks when the bridge does. The live panel above and the
 *   positions table below will show their error states while this one keeps
 *   answering, which is correct — a closed deal is history and does not stop
 *   being true because a connection dropped.
 *
 * The period is stated beside the figures either way, because a statistics panel
 * that does not say what it covers gets read as all-time.
 *
 * ## Why the period options stop at 30 days
 *
 * The server caps the window at 31, and the reason is no longer MT5's silent
 * truncation — it is that the whole window is summed in one pass. Offering "this
 * year" here would be asking for a total nobody has bounded.
 */
const PERIODS: { value: string; days: number; key: MessageKey }[] = [
  { value: '7', days: 7, key: 'accounts.period7' },
  { value: '30', days: 30, key: 'accounts.period30' },
];

export function AccountActivity({ accountId, currency }: { accountId: string; currency: string }) {
  const [period, setPeriod] = React.useState('30');

  const days = PERIODS.find((option) => option.value === period)?.days ?? 30;
  const window = React.useMemo(() => rangeEndingToday(days), [days]);

  /*
   * The window is in the query key, so switching period is a different cached
   * result rather than a refetch of the same one. Without it React Query would
   * serve the 30-day figures under a "7 days" heading until the fetch settled.
   */
  const history = useResource(
    keys.tradingAccounts.history(accountId, window.from, window.to),
    (signal) => tradingApi.getAccountHistory(accountId, window, signal),
  );

  const tabs: TabDefinition[] = PERIODS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('accounts.activityTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('accounts.activityPeriod', {
              from: formatDate(window.from),
              to: formatDate(window.to),
            })}
          </p>
        </div>
        <Tabs tabs={tabs} value={period} onValueChange={setPeriod} idPrefix="account-period" />
      </header>

      <AsyncBoundary
        status={history.status}
        label={t('accounts.activityLoading')}
        endpoints={['GET /trading/accounts/:id/history']}
        onRetry={() => void history.refetch()}
        errorMessage={apiErrorMessage(history.error, t('accounts.activityLoadFailed'))}
        error={history.error}
      >
        <StatsCards stats={history.data?.stats} currency={currency} dimmed={history.isFetching} />
      </AsyncBoundary>
    </section>
  );
}

/**
 * The statistics, as small cards.
 *
 * Cards rather than a metric/value table, because these are thirteen unrelated
 * single figures rather than thirteen rows of one thing. A table implies its
 * rows are comparable and sortable — neither is true of "win rate" beside "first
 * activity", and the shared column widths force a percentage, a lot count and a
 * timestamp into the same narrow gutter.
 *
 * The tables on this screen stay tables: transfers and positions are lists of
 * like rows, which is what the shape is for.
 *
 * These cards are now the WHOLE card. The stat grid used to sit under a
 * "Trading statistics" sub-heading with the deal table under its own — with one
 * section left, a second heading between the card's own title and the figures
 * labels nothing.
 */
function StatsCards({
  stats,
  currency,
  dimmed,
}: {
  stats: AccountStats | undefined;
  currency: string;
  dimmed: boolean;
}) {
  const cards = React.useMemo(
    () => (stats ? buildStatCards(stats, currency) : []),
    [stats, currency],
  );

  return (
    <div>
      {/*
        WHY every figure is zero, on an account that plainly has activity.

        These statistics count CLOSED ROUND TRIPS only — that is what makes a win
        rate meaningful — so an account funded by deposits and transfers but never
        traded reports zero across the board. Correct, and unreadable without this
        line: a panel of thirteen zeros reads as a broken screen rather than as
        "no trades yet", and the first thing a client does about a broken screen
        is ask whether their money is safe.

        It matters MORE now than when it was written. The line then had a full
        deal table under it, so a reader could at least see rows; with the table
        gone these zeros are the only thing on the card, and the sentence is the
        only thing standing between them and a support ticket. It must not point
        at a table for the answer — which is why the copy no longer does.

        Shown only when the window really has no trades, so it never editorialises
        over real figures.
      */}
      {stats && stats.trades === 0 && (
        <p className="mb-2 text-xs text-muted-foreground">{t('accounts.statsNoTradesNote')}</p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">{t('accounts.statsEmptyBody')}</p>
        </div>
      ) : (
        <div
          /*
           * `dimmed` while a refetch is in flight, matching what `DataTable`
           * does with the same prop. Without it the cards would sit at full
           * strength showing the PREVIOUS period's figures under the newly
           * chosen heading — the one moment these numbers are actively wrong.
           */
          className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
            dimmed ? 'opacity-60' : ''
          }`}
        >
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                {card.label}
              </p>
              <div className="mt-1 text-lg font-bold tabular-nums">{card.value}</div>
              {card.hint && <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface StatCard {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

function buildStatCards(stats: AccountStats, currency: string): StatCard[] {
  const rate = winRate(stats);

  return [
    { label: t('accounts.statsTrades'), value: String(stats.trades) },
    {
      label: t('accounts.statsWinRate'),
      /*
       * Null only when there are no trades, and rendered as an em dash: "0% of
       * no trades" is a statement about performance that has not happened.
       *
       * `toFixed` on a number is correct here in a way it never is on a balance
       * — a win rate is a ratio of two counts, not money.
       */
      value:
        rate === null
          ? t('accounts.unknownValue')
          : t('accounts.statsWinRateValue', { rate: rate.toFixed(1) }),
      // Spelled out rather than "8 / 20", which reads as a fraction of the total
      // — and wins and losses do NOT sum to the total when a trade closes flat.
      hint: t('accounts.statsWinLoss', { wins: stats.wins, losses: stats.losses }),
    },
    {
      label: t('accounts.statsVolume'),
      value: t('accounts.statsVolumeUnit', { lots: formatDecimal(stats.volume) }),
    },
    {
      label: t('accounts.statsNetProfit'),
      value: <Signed amount={stats.netProfit} currency={currency} />,
    },
    {
      label: t('accounts.statsGrossProfit'),
      value: <Signed amount={stats.grossProfit} currency={currency} />,
    },
    {
      label: t('accounts.statsGrossLoss'),
      value: <Signed amount={stats.grossLoss} currency={currency} />,
    },
    {
      label: t('accounts.statsCommission'),
      value: <Signed amount={stats.commission} currency={currency} />,
    },
    { label: t('accounts.statsSwap'), value: <Signed amount={stats.swap} currency={currency} /> },
    {
      // Null with no trades stays an em dash: '0' beside a currency symbol
      // claims there WAS a best trade and it broke even.
      label: t('accounts.statsBest'),
      value: <Signed amount={stats.bestTrade} currency={currency} />,
    },
    {
      label: t('accounts.statsWorst'),
      value: <Signed amount={stats.worstTrade} currency={currency} />,
    },
    {
      label: t('accounts.statsFirstDeal'),
      value: (
        <span className="text-sm">
          {stats.firstDealAt ? formatDateTime(stats.firstDealAt) : t('accounts.unknownValue')}
        </span>
      ),
    },
    {
      label: t('accounts.statsLastDeal'),
      value: (
        <span className="text-sm">
          {stats.lastDealAt ? formatDateTime(stats.lastDealAt) : t('accounts.unknownValue')}
        </span>
      ),
    },
  ];
}

/**
 * A signed amount, coloured from the RAW decimal string via `moneySign`.
 *
 * Never from the formatted text: that breaks on the currency symbol, on digit
 * grouping, and on locales that bracket negatives — and it breaks by painting a
 * loss green.
 */
function Signed({ amount, currency }: { amount: string | null; currency: string }) {
  if (amount === null) {
    return <span className="text-muted-foreground">{t('accounts.unknownValue')}</span>;
  }

  const sign = moneySign(amount);
  const formatted = formatMoney(amount, currency);

  return (
    <span
      className={`font-semibold tabular-nums ${
        sign === 'positive' ? 'text-success' : sign === 'negative' ? 'text-destructive' : ''
      }`}
    >
      {sign === 'positive' ? `+${formatted}` : formatted}
    </span>
  );
}

/**
 * The last `days` days, ending today, as `YYYY-MM-DD`.
 *
 * Through `todayIso()` rather than `toISOString().split('T')[0]`, which converts
 * to UTC first and so returns tomorrow for eastern zones in the evening — the
 * rule `lib/date-range.ts` exists to enforce. The arithmetic runs on a local
 * `Date` and is read back with local getters for the same reason.
 */
function rangeEndingToday(days: number): { from: string; to: string } {
  const to = todayIso();

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));

  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');

  return { from: `${start.getFullYear()}-${month}-${day}`, to };
}

/** `2026-08-14` from an ISO timestamp, in the reader's locale. */
function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/** 24-hour and shared, so a day boundary stays visible — see `formatDealTime`. */
function formatDateTime(value: string): string {
  return formatDealTime(value, t('accounts.unknownValue'));
}
