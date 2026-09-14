'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { tradingApi, type AccountDeal, type AccountHistory } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { formatDealTime, moneySign } from '@/lib/account-stats';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The account's CLOSED trades, and the totals over the same window.
 *
 * ## ⚠️ This panel used to show OPEN positions, and the swap is the point
 *
 * The open-positions table was removed on the owner's call. What replaced it is
 * the thing a client could not see anywhere in the portal: a closed trade.
 *
 * That gap was invisible in the worst way. The "Activity" card that once
 * carried closed-trade figures was deleted, and the API reader went with it —
 * so the endpoint kept answering and nothing ever asked. A client with no open
 * trades saw an empty panel that looked identical to a client whose history had
 * been lost, and neither of them could reach a realised result.
 *
 * ## Everything here is SETTLED, which changes the whole shape of the panel
 *
 * The open-positions table had to poll, state its read time, and caveat every
 * figure as a reading rather than a fact, because a floating P/L moves on every
 * tick. None of that applies to a closed trade: the result is final, so there is
 * no interval, no read timestamp, and no live badge.
 *
 * It is also a DATABASE read — `mt5_deals`, populated by the bridge as it
 * ingests — so it survives MT5 being unreachable and costs none of the bridge's
 * single session lock. That is why it needs no refresh control either.
 *
 * ## The WINDOW is part of the answer, so the panel says so
 *
 * `stats` is computed over the deals in the period, not over the account's
 * lifetime, and an empty table usually means "nothing in these 30 days" rather
 * than "nothing ever". Both the subtitle and the empty state name the period for
 * that reason — a client who traded three months ago and nothing since must not
 * read this as their history being gone.
 *
 * ## `closing` decides what counts, and the server decides `closing`
 *
 * `mt5_deals` holds every deal the bridge ingests, which includes the OPENING
 * leg of each trade and balance operations (deposits, credits, corrections).
 * Only deals the server marked `closing` realised a result. Filtering on MT5's
 * raw `entry` code here instead would mean reimplementing that mapping in the
 * browser, against a vocabulary that can grow.
 */
export function AccountPositions({ accountId, currency }: { accountId: string; currency: string }) {
  /*
   * NO `refetchInterval`, deliberately — the contrast with the open-positions
   * table this replaced is the reasoning.
   *
   * That one polled every ten seconds because its numbers moved on every tick.
   * A closed trade's result is final, so polling would re-read our own table
   * for an answer that cannot have changed. A new closed trade arrives when the
   * client reloads or navigates back, which is when React Query refetches
   * anyway.
   *
   * `retry` is left at the default, unlike positions: this does not cross the
   * bridge, so a failure is an ordinary database or network error and retrying
   * is worth it rather than piling onto a contended MT5 lock.
   */
  const history = useResource(keys.tradingAccounts.history(accountId), (signal) =>
    tradingApi.getAccountHistory(accountId, {}, signal),
  );

  /*
   * CLOSED trades only. The response carries opening legs and balance
   * operations too — see the class note on why `closing` is the server's call
   * and not a raw `entry` check here.
   */
  const deals = React.useMemo(
    () => (history.data?.deals ?? []).filter((deal) => deal.closing),
    [history.data],
  );

  const stats = history.data?.stats;
  const columns = React.useMemo(() => buildColumns(currency), [currency]);

  /*
   * The server caps the window at 500 deals. Saying so only when the cap is
   * actually reached is the rule the transactions list follows: a truncation
   * notice on a list that is not truncated is a warning about a problem nobody
   * has. Compared against the RAW count, not the filtered one — the cap applies
   * before `closing` is considered.
   */
  const capped = (history.data?.deals.length ?? 0) >= 500;

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
        />

        {capped && (
          <p className="text-[11px] text-muted-foreground">{t('accounts.positionsCapped')}</p>
        )}
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
      {sign === 'positive' ? `+${formatted}` : formatted}
    </span>
  );
}

/** 24-hour and shared, so a day boundary stays visible — see `formatDealTime`. */
function formatDateTime(value: string): string {
  return formatDealTime(value, t('accounts.unknownValue'));
}
