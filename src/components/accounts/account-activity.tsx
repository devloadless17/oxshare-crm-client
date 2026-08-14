'use client';

import * as React from 'react';
import { Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Tabs, type TabDefinition } from '@/components/ui/tabs';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type AccountDeal, type AccountStats } from '@/lib/api/trading';
import { formatDecimal, formatMoney, isZeroMoney } from '@/lib/money';
import { formatDealTime, moneySign, showsRealisedAmount, winRate } from '@/lib/account-stats';
import { todayIso } from '@/lib/date-range';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * What this account did over a period: the statistics, and the deals behind them.
 *
 * ## One request feeds both tables
 *
 * `GET /trading/accounts/:id/history` returns the deals AND the statistics
 * computed from exactly those deals. Two requests would mean two round trips to
 * MT5 for one window and — worse — two windows that can disagree, so a client
 * would read totals describing one set beside a list showing another.
 *
 * ## Everything is LIVE, and describes the selected period only
 *
 * Read from the trading server on each view rather than from the CRM's ingested
 * table, which only ever holds what a background sweep has managed to copy. The
 * period is stated beside the figures because a statistics panel that does not
 * say what it covers gets read as all-time.
 *
 * ## Why the period options stop at 30 days
 *
 * MT5 truncates a request for a longer window silently rather than refusing it,
 * so the server caps the span at 31 days. Offering "this year" here would mean
 * offering a number that is quietly wrong.
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
    ['trading-account-history', accountId, window.from, window.to],
    (signal) => tradingApi.getAccountHistory(accountId, window, signal),
    // `retry: 0`: an MT5 read behind a single lock, with a Retry button in the
    // error state. See the note on the snapshot query in the account page.
    { retry: 0 },
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
        <div className="flex flex-col gap-6">
          <StatsCards stats={history.data?.stats} currency={currency} dimmed={history.isFetching} />
          <DealsTable
            deals={history.data?.deals ?? []}
            currency={currency}
            dimmed={history.isFetching}
          />
        </div>
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
 * The tables on this screen stay tables: deals, transfers and positions are all
 * lists of like rows, which is what the shape is for.
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
      <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {t('accounts.statsTitle')}
      </h3>

      {/*
        WHY every figure is zero, on an account that plainly has activity.

        These statistics count CLOSED ROUND TRIPS only — that is what makes a win
        rate meaningful — so an account funded by deposits and transfers but never
        traded reports zero across the board. Correct, and unreadable without this
        line: a full history table sits directly underneath, so a panel of zeros
        above it reads as a broken screen rather than as "no trades yet", and the
        first thing a client does about a broken screen is ask whether their money
        is safe.

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

/** The deal history for the same window, newest first. */
function DealsTable({
  deals,
  currency,
  dimmed,
}: {
  deals: AccountDeal[];
  currency: string;
  dimmed: boolean;
}) {
  const columns = React.useMemo(() => buildDealColumns(currency), [currency]);

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {t('accounts.historyTitle')}
      </h3>
      <DataTable
        columns={columns}
        rows={deals}
        rowKey={(deal) => deal.ticket}
        dimmed={dimmed}
        empty={<EmptyState icon={Receipt} message={t('accounts.historyEmptyBody')} />}
        // The whole window is in hand, so paging it here is a view concern and
        // "page 2" means what it says — the case `clientPagination` documents.
        clientPagination={{
          pageSize: 25,
          noun: [t('accounts.deal'), t('accounts.dealsPlural')],
        }}
      />
    </div>
  );
}

/**
 * MT5's action slugs, mapped to something a client reads.
 *
 * Keyed by the slug the API sends rather than by the numeric code, so this map
 * and the server's own labelling cannot disagree about what action 7 is.
 *
 * A code this map does not know falls through to `actionLabel` AS SENT — which
 * the API renders as `action 19` for an MT5 build newer than this list. That is
 * deliberately not blanked and not guessed: a client can quote an odd label to
 * support, where a blank type beside an amount is what generates the ticket.
 */
const ACTION_LABELS: Record<string, MessageKey> = {
  buy: 'accounts.dealBuy',
  sell: 'accounts.dealSell',
  balance: 'accounts.dealBalance',
  credit: 'accounts.dealCredit',
  charge: 'accounts.dealCharge',
  correction: 'accounts.dealCorrection',
  bonus: 'accounts.dealBonus',
  commission: 'accounts.dealCommission',
  commission_daily: 'accounts.dealCommission',
  commission_monthly: 'accounts.dealCommission',
  agent: 'accounts.dealCommission',
  agent_daily: 'accounts.dealCommission',
  agent_monthly: 'accounts.dealCommission',
  interest: 'accounts.dealInterest',
  dividend: 'accounts.dealDividend',
  dividend_franked: 'accounts.dealDividend',
  tax: 'accounts.dealTax',
  buy_canceled: 'accounts.dealCanceled',
  sell_canceled: 'accounts.dealCanceled',
};

function actionText(deal: AccountDeal): string {
  const key = ACTION_LABELS[deal.actionLabel];
  return key ? t(key) : deal.actionLabel;
}

function buildDealColumns(currency: string): Column<AccountDeal>[] {
  return [
    {
      header: t('accounts.colTime'),
      cell: (deal) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(deal.dealtAt)}</span>
      ),
      sortable: true,
      sortKey: 'dealtAt',
      sortType: 'date',
    },
    {
      header: t('accounts.colType'),
      cell: (deal) => <span className="whitespace-nowrap">{actionText(deal)}</span>,
    },
    {
      header: t('accounts.colSymbol'),
      // A balance operation has no symbol worth showing — MT5 sends an empty
      // string. An em dash, so the column reads "not applicable" rather than
      // naming an instrument that was never traded.
      cell: (deal) => <Muted>{deal.symbol || t('accounts.unknownValue')}</Muted>,
    },
    {
      header: t('accounts.colVolume'),
      align: 'right',
      /*
       * `0` on a funding row is NOISE, and it read as data.
       *
       * MT5 sends `volume: '0'` and `price: '0'` on every balance operation
       * because neither concept applies — nothing was bought at no price. The
       * table printed a bare `0` in both columns on all ten rows of an account
       * whose history is entirely deposits and transfers, which says "zero lots
       * were traded at a price of zero" rather than "this row is not a trade".
       *
       * An em dash is the same answer the Symbol column already gave, and the
       * three now agree instead of two saying "not applicable" while a third
       * asserts a quantity.
       */
      cell: (deal) =>
        isZeroMoney(deal.volume) ? (
          <Muted>{t('accounts.unknownValue')}</Muted>
        ) : (
          <span className="tabular-nums">{formatDecimal(deal.volume)}</span>
        ),
    },
    {
      header: t('accounts.colPrice'),
      align: 'right',
      // See Volume: a price of zero is "no price", not a price.
      cell: (deal) =>
        isZeroMoney(deal.price) ? (
          <Muted>{t('accounts.unknownValue')}</Muted>
        ) : (
          <span className="tabular-nums">{formatDecimal(deal.price)}</span>
        ),
    },
    {
      header: t('accounts.colProfit'),
      align: 'right',
      sortable: true,
      sortKey: 'profit',
      // `money`, so amounts sort through decimal.js and '9' does not outrank
      // '100' — the specific bug that sort type exists to close.
      sortType: 'money',
      cell: (deal) => <Profit deal={deal} currency={currency} />,
    },
    {
      header: t('accounts.colTicket'),
      align: 'right',
      cell: (deal) => <span className="font-mono text-xs tabular-nums">{deal.ticket}</span>,
    },
  ];
}

/**
 * The AMOUNT cell — realised P/L on a trade, the sum moved on a funding row.
 *
 * ## `!closing` is not one case, and treating it as one HID REAL MONEY
 *
 * `closing` answers "did a TRADE realise a result", which is correctly false for
 * a deposit, a withdrawal, a credit or a CRM transfer — none of them close a
 * position. This returned the "pending" em dash for everything that was not a
 * closing trade, so an account funded with a $1,000 transfer showed a dash in
 * the only column carrying an amount. Every row on the screenshot that prompted
 * this fix was a real movement rendered as no movement.
 *
 * The two false cases need opposite treatment, which is why the branch is on
 * `isTrade` first:
 *
 * - An OPEN trade has not realised anything. Its `profit: '0'` is a placeholder,
 *   and formatting it as `$0.00` would claim a live position broke even. Em
 *   dash — the original reasoning, and still right.
 * - A BALANCE operation's amount is FINAL the moment it exists. There is no
 *   later row that will restate it, so a dash here loses the only number the
 *   row carries.
 *
 * A genuine zero on a funding row (a $0.00 correction) now prints as `$0.00`,
 * which is honest: that row really did move nothing, and it is a different claim
 * from "not applicable yet".
 */
function Profit({ deal, currency }: { deal: AccountDeal; currency: string }) {
  // The rule itself lives in `lib/account-stats`, pure and tested — it decides
  // whether a client sees an amount at all, which is not a decision worth
  // leaving un-pinned inside a cell renderer.
  if (!showsRealisedAmount(deal)) {
    return <span className="text-muted-foreground">{t('accounts.profitPending')}</span>;
  }

  return <Signed amount={deal.profit} currency={currency} />;
}

/**
 * A cell that is deliberately not a value — "this column does not apply here".
 *
 * Muted rather than plain, so a column of em dashes reads as absence at a glance
 * instead of competing with the figures beside it.
 */
function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
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
