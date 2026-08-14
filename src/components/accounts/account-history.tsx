'use client';

import * as React from 'react';
import { Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Tabs, type TabDefinition } from '@/components/ui/tabs';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type AccountDeal, type AccountDealsQuery } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { moneySign } from '@/lib/account-stats';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * Everything MT5 has reported on this account — trades and money movements.
 *
 * ## Paged and filtered SERVER-side, unlike `/transactions`
 *
 * The transactions screen filters a whole array in the browser, and its own file
 * comment marks that as bounded: it works because `GET /payments/transactions`
 * returns the entire history. A deal history does not have that bound — an
 * active account produces deals indefinitely — so filtering one page in the
 * browser would silently under-report a client's own trading, which is the
 * exact failure that note warns about. Every filter and the pager therefore go
 * to the server.
 *
 * ## "History", not "Transactions"
 *
 * This list is MT5's deals for one account. `/transactions` is the wallet's
 * deposits and withdrawals across the whole client. They overlap — a deposit
 * that funded this account appears in both — but they are different sets with
 * different scopes, and giving them the same name invites reading one total as
 * the other.
 */
const KIND_TABS: TabDefinition[] = [
  { value: 'all', label: t('accounts.historyAll') },
  { value: 'trades', label: t('accounts.historyTrades') },
  { value: 'balance', label: t('accounts.historyBalance') },
];

const PAGE_SIZE = 25;

export function AccountHistory({
  accountId,
  currency,
  hasLogin,
}: {
  accountId: string;
  currency: string;
  hasLogin: boolean;
}) {
  const [kind, setKind] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const query: AccountDealsQuery = {
    kind: kind === 'all' ? undefined : (kind as 'trades' | 'balance'),
    page,
    limit: PAGE_SIZE,
  };

  /*
   * `kind` and `page` are BOTH in the query key, so changing either is a
   * different cached result rather than a refetch of the same one. Leaving the
   * page out is the classic version of this bug: React Query serves page 1 from
   * cache while the pager reads 3, and the client sees the footer and the rows
   * disagree.
   */
  const deals = useResource(['trading-account-deals', accountId, kind, page], (signal) =>
    tradingApi.getAccountDeals(accountId, query, signal),
  );

  const columns = React.useMemo(() => buildColumns(currency), [currency]);
  const rows = deals.data?.items ?? [];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('accounts.historyTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('accounts.historyNote')}</p>
      </header>

      <Tabs
        tabs={KIND_TABS}
        value={kind}
        onValueChange={(next) => {
          setKind(next);
          /*
           * Back to page 1 on every filter change. Staying on page 4 of a
           * narrower result set lands on an empty page — which reads as "this
           * filter matched nothing" when it matched plenty, just not that far in.
           */
          setPage(1);
        }}
        idPrefix="account-history"
      />

      <AsyncBoundary
        status={deals.status}
        label={t('accounts.historyLoading')}
        endpoints={['GET /trading/accounts/:id/deals']}
        onRetry={() => void deals.refetch()}
        errorMessage={apiErrorMessage(deals.error, t('accounts.historyLoadFailed'))}
        error={deals.error}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(deal) => deal.ticket}
          dimmed={deals.isFetching}
          empty={
            <EmptyState
              icon={Receipt}
              /*
               * An account with no MT5 login has no history BY DEFINITION —
               * deals are keyed by login — where an account that has one and no
               * rows simply has not traded. Two messages, because "nothing yet"
               * on an unprovisioned account invites waiting for something that
               * cannot arrive until an operator acts.
               */
              message={
                hasLogin ? t('accounts.historyEmptyBody') : t('accounts.historyEmptyNoLogin')
              }
            />
          }
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: deals.data?.total ?? 0,
            onPageChange: setPage,
            noun: [t('accounts.deal'), t('accounts.dealsPlural')],
          }}
        />
      </AsyncBoundary>
    </section>
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

function buildColumns(currency: string): Column<AccountDeal>[] {
  return [
    {
      header: t('accounts.colTime'),
      cell: (deal) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(deal.dealtAt)}</span>
      ),
    },
    {
      header: t('accounts.colType'),
      cell: (deal) => <span className="whitespace-nowrap">{actionText(deal)}</span>,
    },
    {
      header: t('accounts.colSymbol'),
      /*
       * A balance operation has no symbol worth showing — MT5 sends an empty
       * string or a placeholder. An em dash rather than whatever arrived, so the
       * column reads as "not applicable" instead of as a tradeable instrument.
       */
      cell: (deal) => deal.symbol || t('accounts.unknownValue'),
    },
    {
      header: t('accounts.colVolume'),
      align: 'right',
      // `formatDecimal`, not `formatMoney`: lots are not money, and a currency
      // symbol in front of `0.5` would be wrong.
      cell: (deal) => <span className="tabular-nums">{formatDecimal(deal.volume)}</span>,
    },
    {
      header: t('accounts.colPrice'),
      align: 'right',
      // A price is not money either — a JPY pair quotes to three places and most
      // others to five, and `formatMoney`'s fixed 2dp would hide the digits the
      // row is being read for.
      cell: (deal) => <span className="tabular-nums">{formatDecimal(deal.price)}</span>,
    },
    {
      header: t('accounts.colProfit'),
      align: 'right',
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
 * The P/L cell.
 *
 * ## An opening deal shows an em dash, never `0.00`
 *
 * `closing` comes from the server and marks the deals that realised a result.
 * An opening deal carries `profit: '0'` because nothing has been realised yet —
 * rendering that as a currency-formatted zero states that the trade broke even,
 * which is a claim about a position that is still open.
 *
 * The colour is decided by `moneySign` on the raw decimal string. Reading the
 * sign back off the formatted text would break on the currency symbol and on
 * locales that bracket negatives rather than signing them, and it would break by
 * painting a loss green.
 */
function Profit({ deal, currency }: { deal: AccountDeal; currency: string }) {
  if (!deal.closing) {
    return <span className="text-muted-foreground">{t('accounts.profitPending')}</span>;
  }

  const sign = moneySign(deal.profit);
  const formatted = formatMoney(deal.profit, currency);

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

/** Locale-formatted, and guarded against an unparseable value from the API. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('accounts.unknownValue') : date.toLocaleString();
}
