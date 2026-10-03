'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { tradingApi, type AccountDeal, type AccountHistory } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { ltr } from '@/lib/bidi';
import { formatDealTime, moneySign } from '@/lib/account-stats';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/** Closed trades per page. The SERVER's page size — see the table's own note. */
const PAGE_SIZE = 10;

/**
 * The account's CLOSED trades, and the totals over the same window.
 *
 * ## It sits BELOW the open-positions table, and neither replaces the other
 *
 * This panel once replaced that one outright, which left a client with no way
 * to see what their account was doing NOW — the thing the screen is opened for.
 * Both are here: `AccountOpenPositions` answers "what am I holding", this
 * answers "how did I do". A client with nothing open still has a history, and a
 * client mid-trade still wants to see it.
 *
 * ## Everything here is SETTLED, which changes the whole shape of the panel
 *
 * The open-positions table polls, states its read time, and caveats every
 * figure as a reading rather than a fact, because a floating P/L moves on every
 * tick. None of that applies to a closed trade: the result is final, so there is
 * no interval, no read timestamp, and no live badge.
 *
 * It is also a DATABASE read — `mt5_deals`, populated by the bridge as it
 * ingests — so it survives MT5 being unreachable and costs none of the bridge's
 * single session lock. That is why it needs no refresh control either, and why
 * it can be paged by the server where the live table pages in the browser.
 *
 * ## The WINDOW is part of the answer, so the panel says so
 *
 * `stats` is computed over every closed trade in the period — NOT over the page
 * on screen, and not over the account's lifetime. That separation is what makes
 * paging safe: the totals hold still while a client pages through, where totals
 * summed from the visible rows would change on every page turn.
 *
 * An empty table usually means "nothing in these 30 days" rather than "nothing
 * ever", so both the subtitle and the empty state name the period — a client who
 * traded three months ago and nothing since must not read this as their history
 * being gone.
 *
 * ## `closing` decides what counts, and the server decides `closing`
 *
 * `mt5_deals` holds every deal the bridge ingests, which includes the OPENING
 * leg of each trade and balance operations (deposits, credits, corrections).
 * Only deals the server marked `closing` realised a result — and it now FILTERS
 * on that rather than labelling it, because a browser-side filter applied after
 * a slice returns short pages under a pager that counted the unfiltered rows.
 */
export function AccountPositions({ accountId, currency }: { accountId: string; currency: string }) {
  const [page, setPage] = React.useState(1);

  /*
   * NO `refetchInterval`, deliberately — the contrast with the open-positions
   * table above is the reasoning.
   *
   * That one polls every ten seconds because its numbers move on every tick. A
   * closed trade's result is final, so polling would re-read our own table for
   * an answer that cannot have changed. A new closed trade arrives when the
   * client reloads or navigates back, which is when React Query refetches
   * anyway.
   *
   * `retry` is left at the default, unlike positions: this does not cross the
   * bridge, so a failure is an ordinary database or network error and retrying
   * is worth it rather than piling onto a contended MT5 lock.
   */
  const params = { page, limit: PAGE_SIZE };
  const history = useResource(keys.tradingAccounts.history(accountId, params), (signal) =>
    tradingApi.getAccountHistory(accountId, params, signal),
  );

  /*
   * NOT filtered here any more, and that is the point of the server change.
   *
   * This used to receive the whole window — opening legs and balance operations
   * included — and drop the non-closing rows in the browser. Filtering AFTER a
   * slice is what makes a paged list wrong: a page of ten ingested deals
   * holding three closed trades renders three rows under a pager that counted
   * ten, and the last page can be empty. The server pages the closed trades
   * themselves, so a page is a page.
   */
  const deals = history.data?.deals ?? [];
  const stats = history.data?.stats;
  const total = history.data?.total ?? 0;
  const columns = React.useMemo(() => buildColumns(currency), [currency]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <header>
        <h2 className="text-sm font-semibold">{t('accounts.positionsTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('accounts.positionsWindow')}</p>
      </header>

      <AsyncBoundary
        status={history.status}
        label={t('accounts.positionsLoading')}
        endpoints={['GET /trading/accounts/:id/history']}
        onRetry={() => void history.refetch()}
        errorMessage={t('accounts.positionsLoadFailed')}
        error={history.error}
      >
        {/*
          The TOTALS above the table, and only when there are trades behind
          them. A row of zeros and em dashes over an empty table says nothing
          the empty state does not already say, and reads as a broken panel.
        */}
        {stats && stats.trades > 0 && <Totals stats={stats} currency={currency} />}

        <DataTable
          columns={columns}
          rows={deals}
          rowKey={(deal) => deal.ticket}
          dimmed={history.isFetching}
          empty={<EmptyState icon={History} message={t('accounts.positionsEmpty')} />}
          /*
           * SERVER pagination, unlike the open-positions table above.
           *
           * Closed trades accumulate without bound — a year of them is tens of
           * thousands of rows — so the old shape fetched a 500-row cap and told
           * the client it had been truncated. `total` is the count of closed
           * trades in the window, so the pager knows how far it goes without
           * anything having to fetch it all to find out.
           */
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
            noun: [t('table.row'), t('table.rows')],
          }}
        />
      </AsyncBoundary>
    </section>
  );
}

/**
 * Closed-trade totals for the window.
 *
 * `netProfit` leads because it is what a client looks for first. The gross
 * figures and the win/loss split are the arithmetic behind it — a net number
 * with nothing either side of it is one nobody can check.
 */
function Totals({ stats, currency }: { stats: AccountHistory['stats']; currency: string }) {
  /*
   * The win rate is computed from `trades`, which the server documents as the
   * number of CLOSED ROUND TRIPS — the correct denominator. Guarded against
   * zero even though the caller already checks it: a percentage of nothing is
   * `NaN`, and `NaN%` on a money screen is worse than the panel being absent.
   */
  const winRate = stats.trades > 0 ? Math.round((stats.wins / stats.trades) * 100) : null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label={t('accounts.statsNet')}>
        <Signed amount={stats.netProfit} currency={currency} />
      </Stat>
      <Stat label={t('accounts.statsTrades')}>
        <span className="text-sm font-semibold tabular-nums">{stats.trades}</span>
        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
          {t('accounts.statsWinLoss', { wins: stats.wins, losses: stats.losses })}
        </span>
      </Stat>
      <Stat label={t('accounts.statsWinRate')}>
        <span className="text-sm font-semibold tabular-nums">
          {winRate === null ? t('accounts.statsNoTrades') : `${winRate}%`}
        </span>
      </Stat>
      <Stat label={t('accounts.statsVolume')}>
        {/* Lots, not money — no currency symbol belongs on a volume. */}
        <span className="text-sm font-semibold tabular-nums">{formatDecimal(stats.volume)}</span>
      </Stat>
      <Stat label={t('accounts.statsBest')}>
        <Signed amount={stats.bestTrade} currency={currency} />
      </Stat>
      <Stat label={t('accounts.statsWorst')}>
        <Signed amount={stats.worstTrade} currency={currency} />
      </Stat>
    </dl>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function buildColumns(currency: string): Column<AccountDeal>[] {
  return [
    {
      header: t('accounts.colSymbol'),
      cell: (deal) => <span className="font-medium">{deal.symbol}</span>,
    },
    {
      header: t('accounts.colSide'),
      /*
       * `actionLabel` is named server-side from MT5's numeric action, and an
       * unfamiliar code arrives as `action <n>` rather than blank. Only the two
       * known sides get colour: painting an unknown code green or red would be a
       * claim about a direction nobody has established.
       */
      cell: (deal) => (
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
            deal.actionLabel === 'buy'
              ? 'border-success/20 bg-success/10 text-success'
              : deal.actionLabel === 'sell'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {deal.actionLabel === 'buy'
            ? t('accounts.sideBuy')
            : deal.actionLabel === 'sell'
              ? t('accounts.sideSell')
              : deal.actionLabel}
        </span>
      ),
    },
    {
      header: t('accounts.colVolume'),
      align: 'right',
      // Lots, not money — `formatDecimal` so no currency symbol appears.
      cell: (deal) => <span className="tabular-nums">{formatDecimal(deal.volume)}</span>,
    },
    {
      header: t('accounts.colClosePrice'),
      align: 'right',
      // A price is not money either: a fixed 2dp would round 1.08337 to 1.08 and
      // hide the digits the row is being read for.
      cell: (deal) => <span className="tabular-nums">{formatDecimal(deal.price)}</span>,
    },
    {
      header: t('accounts.colCommission'),
      align: 'right',
      cell: (deal) => <Signed amount={deal.commission} currency={currency} muted />,
    },
    {
      header: t('accounts.colSwap'),
      align: 'right',
      cell: (deal) => <Signed amount={deal.swap} currency={currency} muted />,
    },
    {
      header: t('accounts.colRealised'),
      align: 'right',
      cell: (deal) => <Signed amount={deal.profit} currency={currency} />,
    },
    {
      header: t('accounts.colClosed'),
      cell: (deal) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {formatDateTime(deal.dealtAt)}
        </span>
      ),
    },
  ];
}

/**
 * A signed amount, coloured by `moneySign` on the RAW decimal string.
 *
 * Never by inspecting the formatted text: that breaks on the currency symbol, on
 * digit grouping, and on any locale that brackets negatives instead of signing
 * them — and it breaks by painting a loss green.
 */
function Signed({
  amount,
  currency,
  muted = false,
}: {
  amount: string | null;
  currency: string;
  muted?: boolean;
}) {
  if (amount === null) {
    return <span className="text-muted-foreground">{t('accounts.unknownValue')}</span>;
  }

  const sign = moneySign(amount);
  const formatted = formatMoney(amount, currency);

  return (
    <span
      className={`font-semibold tabular-nums ${muted ? 'text-xs' : 'text-sm'} ${
        sign === 'positive' ? 'text-success' : sign === 'negative' ? 'text-destructive' : ''
      }`}
    >
      {ltr(sign === 'positive' ? `+${formatted}` : formatted)}
    </span>
  );
}

/** 24-hour and shared, so a day boundary stays visible — see `formatDealTime`. */
function formatDateTime(value: string): string {
  return formatDealTime(value, t('accounts.unknownValue'));
}
