'use client';

import * as React from 'react';
import { LineChart } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type AccountPosition } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { formatDealTime, moneySign } from '@/lib/account-stats';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * The account's OPEN positions, read live from MT5.
 *
 * ## Every number here is live, and the panel says when it was read
 *
 * `profit` is floating: it moves on every tick, so what is on screen is a
 * reading rather than a fact. The refresh control and the timestamp exist for
 * that reason — a trading figure with no indication of its age gets treated as
 * current however old it is.
 *
 * Nothing is cached beyond React Query's own hold on the last response. The CRM
 * has a `positions` table and it stays empty on purpose: a stored floating P/L
 * is stale the moment it is written, and it would reach a client wearing the
 * same label as this.
 *
 * ## An empty table is a real answer
 *
 * "No open positions" here comes from the trading server, not from the absence
 * of a feature — which is the distinction this screen could not draw before the
 * bridge exposed positions at all.
 */
export function AccountPositions({ accountId, currency }: { accountId: string; currency: string }) {
  /*
   * POLLED on the same ten seconds as the snapshot beside it, and for a
   * stronger reason: an open position's profit moves on every tick, and this is
   * the panel a client watches WHILE the market moves. A number that only
   * changed when they pressed a button was the one thing on this screen
   * guaranteed to be out of date.
   *
   * `GET /accounts/:id/positions` has its own 12/min bucket — the throttle is
   * per route — so this spends half of its own budget rather than competing
   * with the snapshot for one. React Query stops polling a background tab, so
   * neither panel reads MT5 while nobody is looking.
   *
   * `retry: 0` for the reason the snapshot keeps it: this crosses the bridge's
   * single MT5 lock, and a poll already retries ten seconds later.
   */
  const positions = useResource(
    keys.mt5Live.positions(accountId),
    (signal) => tradingApi.getAccountPositions(accountId, signal),
    { retry: 0, refetchInterval: 10_000 },
  );

  /*
   * The read time comes from React Query via `useResource.updatedAt`, not from a
   * `useState` set in an effect — which is a lint error in this repo, and would
   * be the wrong shape anyway: the fetch already knows when it landed, so
   * stamping it again in a render pass is a second source for one fact.
   *
   * `0` means nothing has arrived yet, which is why the header falls back to the
   * undated sentence rather than rendering the epoch.
   */
  const rows = positions.data;
  const readAt = positions.updatedAt ? new Date(positions.updatedAt) : null;

  const columns = React.useMemo(() => buildColumns(currency), [currency]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('accounts.positionsTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {readAt
              ? t('accounts.positionsReadAt', { time: readAt.toLocaleTimeString() })
              : t('accounts.positionsLive')}
          </p>
        </div>
        {/*
          No Refresh button: the panel polls itself every ten seconds while the
          tab is visible. The read time above already says how current it is,
          which is the honest version of what the button was standing in for —
          and keeping both would invite the refresh-mashing the route's 12/min
          throttle exists to absorb.
        */}
      </header>

      <AsyncBoundary
        status={positions.status}
        label={t('accounts.positionsLoading')}
        endpoints={['GET /trading/accounts/:id/positions']}
        onRetry={() => void positions.refetch()}
        errorMessage={apiErrorMessage(positions.error, t('accounts.positionsLoadFailed'))}
        error={positions.error}
      >
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(position) => position.ticket}
          dimmed={positions.isFetching}
          empty={<EmptyState icon={LineChart} message={t('accounts.positionsEmpty')} />}
        />
      </AsyncBoundary>
    </section>
  );
}

function buildColumns(currency: string): Column<AccountPosition>[] {
  return [
    {
      header: t('accounts.colSymbol'),
      cell: (position) => <span className="font-medium">{position.symbol}</span>,
    },
    {
      header: t('accounts.colSide'),
      /*
       * `side` is named server-side from MT5's numeric action, and an unfamiliar
       * code arrives as `action <n>` rather than blank. Only the two known sides
       * get colour: painting an unknown code green or red would be a claim about
       * a direction nobody has established.
       */
      cell: (position) => (
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
            position.side === 'buy'
              ? 'border-success/20 bg-success/10 text-success'
              : position.side === 'sell'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {position.side === 'buy'
            ? t('accounts.sideBuy')
            : position.side === 'sell'
              ? t('accounts.sideSell')
              : position.side}
        </span>
      ),
    },
    {
      header: t('accounts.colVolume'),
      align: 'right',
      // Lots, not money — `formatDecimal` so no currency symbol appears.
      cell: (position) => <span className="tabular-nums">{formatDecimal(position.volume)}</span>,
    },
    {
      header: t('accounts.colOpenPrice'),
      align: 'right',
      cell: (position) => <span className="tabular-nums">{formatDecimal(position.priceOpen)}</span>,
    },
    {
      header: t('accounts.colCurrentPrice'),
      align: 'right',
      // A price is not money either: a fixed 2dp would round 1.08337 to 1.08 and
      // hide the digits the row is being read for.
      cell: (position) => (
        <span className="tabular-nums">{formatDecimal(position.priceCurrent)}</span>
      ),
    },
    {
      header: t('accounts.colStopLoss'),
      align: 'right',
      /*
       * Null means UNSET and renders as an em dash. MT5 stores an absent stop as
       * the price 0, and `0.00` in this column reads as an order to close the
       * position at zero — the opposite of "no protection set".
       */
      cell: (position) => (
        <span className="tabular-nums text-muted-foreground">
          {position.stopLoss === null
            ? t('accounts.unknownValue')
            : formatDecimal(position.stopLoss)}
        </span>
      ),
    },
    {
      header: t('accounts.colTakeProfit'),
      align: 'right',
      cell: (position) => (
        <span className="tabular-nums text-muted-foreground">
          {position.takeProfit === null
            ? t('accounts.unknownValue')
            : formatDecimal(position.takeProfit)}
        </span>
      ),
    },
    {
      header: t('accounts.colSwap'),
      align: 'right',
      cell: (position) => <Signed amount={position.swap} currency={currency} muted />,
    },
    {
      header: t('accounts.colFloating'),
      align: 'right',
      cell: (position) => <Signed amount={position.profit} currency={currency} />,
    },
    {
      header: t('accounts.colOpened'),
      cell: (position) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {formatDateTime(position.openedAt)}
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
      className={`font-semibold tabular-nums ${muted ? 'text-xs' : ''} ${
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
