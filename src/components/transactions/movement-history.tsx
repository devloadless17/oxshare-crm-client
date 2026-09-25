'use client';

import * as React from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ChevronRight, Plus } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { AsyncBoundary } from '@/components/async-boundary';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { SignedAmount } from '@/components/money/signed-amount';
import { TransactionDetails } from '@/components/transactions/transaction-details';
import { MethodCell, StateBadge } from '@/components/transactions/transaction-cells';
import {
  activeFilterCount,
  hasActiveFilters,
  INITIAL_FILTERS,
  toQuery,
  TransactionFilters,
  type Filters,
} from '@/components/transactions/transaction-filters';
import { EmptyPanel, TABLE_FRAME, TABLE_PAGE_SIZE } from '@/components/partner/partner-ui';
import { SummaryTiles } from '@/components/transactions/history-summary';
import { MobileFilterSheet } from '@/components/transactions/mobile-sheets';
import { paymentsApi, type Transaction, type TransactionQuery } from '@/lib/api/payments';
import { walletApi } from '@/lib/api/wallet';
import { t, type MessageKey } from '@/lib/i18n';
import { movementLabelKey } from '@/lib/movement-label';
import { keys } from '@/lib/query-keys';

export type HistoryScope = 'deposits' | 'withdrawals' | 'transfers';

/**
 * What each screen's history IS, as a query — plus its words.
 *
 * `kind` is what draws the line, not `direction`. The API states direction from
 * the wallet's side for every row, so money coming BACK from a trading account
 * is a `deposit`; filtering deposits by direction alone would list that transfer
 * beside card payments and count it in "total deposited".
 */
const SCOPES: Record<
  HistoryScope,
  {
    query: Pick<TransactionQuery, 'kind' | 'direction'>;
    icon: React.ElementType;
    title: MessageKey;
    emptyTitle: MessageKey;
    emptyBody: MessageKey;
    newLabel: MessageKey;
  }
> = {
  deposits: {
    query: { kind: 'payment', direction: 'deposit' },
    icon: ArrowDownToLine,
    title: 'history.depositsTitle',
    emptyTitle: 'history.depositsEmpty',
    emptyBody: 'history.depositsEmptyBody',
    newLabel: 'history.newDeposit',
  },
  withdrawals: {
    query: { kind: 'payment', direction: 'withdrawal' },
    icon: ArrowUpFromLine,
    title: 'history.withdrawalsTitle',
    emptyTitle: 'history.withdrawalsEmpty',
    emptyBody: 'history.withdrawalsEmptyBody',
    newLabel: 'history.newWithdrawal',
  },
  transfers: {
    query: { kind: 'transfer,commission_transfer' },
    icon: ArrowLeftRight,
    title: 'history.transfersTitle',
    emptyTitle: 'history.transfersEmpty',
    emptyBody: 'history.transfersEmptyBody',
    newLabel: 'history.newTransfer',
  },
};

const SORTABLE = ['createdAt', 'amount', 'state'] as const;
type SortColumn = (typeof SORTABLE)[number];
const isSortable = (key: string): key is SortColumn =>
  (SORTABLE as readonly string[]).includes(key);

/**
 * One kind of money movement, with its totals — the History tab of the Deposit,
 * Withdraw and Transfer screens.
 *
 * ## What a client comes here to answer
 *
 * "Did my withdrawal go through?", "how much have I put in?", "is that transfer
 * still processing?". So the screen leads with the TOTALS (summed server-side
 * over every matching row, per currency — never across them, there is no FX
 * source), then the rows, each opening the same detail the full activity list
 * does: reason, destination, reference, settlement date.
 *
 * ## Server-side all the way down
 *
 * Filtering, sorting and paging are the API's, exactly as on the activity list
 * — the table holds one page, and a client-side sort over it would present 10
 * rows as the whole history. The tiles ignore the STATUS filter on purpose: a
 * client narrowing the table to "Rejected" still wants to know what they have
 * deposited, and a "Total deposited: $0" beside it would read as money gone.
 */
export function MovementHistory({
  scope,
  onNew,
}: {
  scope: HistoryScope;
  /** Switches the screen back to its form — the empty state's way forward. */
  onNew: () => void;
}) {
  const config = SCOPES[scope];
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;

  const [filters, setFilters] = React.useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = React.useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'createdAt',
    direction: 'desc',
  });
  const [page, setPage] = React.useState(1);
  const [detail, setDetail] = React.useState<Transaction | null>(null);

  const filterQuery = toQuery(filters);
  const query: TransactionQuery = {
    ...filterQuery,
    ...config.query,
    sort: sort.column,
    order: sort.direction,
    page,
    limit: TABLE_PAGE_SIZE,
  };
  const summaryQuery: TransactionQuery = {
    ...config.query,
    currency: filterQuery.currency,
    from: filterQuery.from,
    to: filterQuery.to,
  };

  const list = useResource(
    keys.transactions.list(query),
    (signal) => paymentsApi.getTransactions(query, signal),
    { enabled: !emailUnverified },
  );
  const summary = useResource(
    keys.transactions.summary(summaryQuery),
    (signal) => paymentsApi.getTransactionSummary(summaryQuery, signal),
    { enabled: !emailUnverified },
  );
  // The currency filter offers what the client HOLDS, not what one page shows.
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal));
  const currencies = React.useMemo(
    () =>
      Array.from(
        new Set([
          ...(wallets.data ?? []).map((w) => w.currency),
          ...(summary.data ?? []).map((r) => r.currency),
        ]),
      ).sort(),
    [wallets.data, summary.data],
  );

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const status = emailUnverified ? 'forbidden' : list.status;

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const columns: Column<Transaction>[] = [
    {
      header: t('transactions.colDate'),
      sortKey: 'createdAt',
      cell: (tx) => {
        const at = new Date(tx.createdAt);
        return (
          <span className="text-muted-foreground">
            <span className="block md:inline">{at.toLocaleDateString()}</span>{' '}
            <span className="block md:inline">{at.toLocaleTimeString()}</span>
          </span>
        );
      },
    },
    {
      // A transfer's row names its route; a deposit's or withdrawal's, its rail.
      header: scope === 'transfers' ? t('history.colRoute') : t('transactions.colMethod'),
      cellClassName: 'max-md:whitespace-normal',
      cell: (tx) => (
        <span className="font-medium">
          {scope === 'transfers' ? t(movementLabelKey(tx)) : <MethodCell tx={tx} />}
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            {scope === 'transfers' ? <MethodCell tx={tx} /> : <Reference id={tx.id} />}
          </span>
        </span>
      ),
    },
    {
      header: t('transactions.colAmount'),
      sortKey: 'amount',
      sortType: 'money',
      align: 'right',
      cell: (tx) => (
        <span className="inline-flex flex-col items-end gap-1">
          <SignedAmount direction={tx.direction} amount={tx.amount} currency={tx.currency} />
          <span className="md:hidden">
            <StateBadge state={tx.state} kind={tx.kind} />
          </span>
        </span>
      ),
    },
    {
      header: t('transactions.colStatus'),
      sortKey: 'state',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (tx) => <StateBadge state={tx.state} kind={tx.kind} />,
    },
    {
      header: '',
      cell: (tx) => (
        <button
          type="button"
          onClick={() => setDetail(tx)}
          aria-label={t('transactions.detailOpen')}
          className="focus-outline cursor-pointer rounded px-2 py-1 text-xs font-medium text-link hover:underline"
        >
          <span className="hidden md:inline">{t('transactions.detailOpen')}</span>
          <ChevronRight className="h-4 w-4 rtl:-scale-x-100 md:hidden" aria-hidden="true" />
        </button>
      ),
    },
  ];

  const neverMoved = total === 0 && !hasActiveFilters(filters);

  const clear = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  return (
    /*
     * `flex-1`, no `min-h-0`: at least the screen's height so the last panel
     * reaches the bottom, and free to grow past it — see MoneyScreen.
     */
    <div className="flex flex-1 flex-col gap-4">
      <SummaryTiles scope={scope} rows={summary.data} failed={summary.status === 'error'} />

      <AsyncBoundary
        status={status}
        label={t('transactions.loading')}
        endpoints={['GET /payments/transactions']}
        onRetry={() => void list.refetch()}
        errorMessage={t('transactions.loadFailed')}
        error={list.error}
      >
        {neverMoved ? (
          <div className="flex flex-1 flex-col rounded-2xl border border-border bg-card">
            <EmptyPanel
              icon={config.icon}
              title={t(config.emptyTitle)}
              body={t(config.emptyBody)}
              action={
                <Button type="button" size="sm" onClick={onNew}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t(config.newLabel)}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <TransactionFilters
                filters={filters}
                currencies={currencies}
                onChange={update}
                onClear={clear}
                showType={false}
              />
            </div>
            <MobileFilterSheet
              title={t('transactions.filters')}
              activeCount={activeFilterCount(filters)}
              onClear={clear}
            >
              <TransactionFilters
                filters={filters}
                currencies={currencies}
                onChange={update}
                onClear={clear}
                showType={false}
                layout="sheet"
              />
            </MobileFilterSheet>
            <div className={`${TABLE_FRAME} flex-1 max-md:[&_td]:px-2 max-md:[&_th]:px-2`}>
              <DataTable
                fill
                caption={t(config.title)}
                columns={columns}
                rows={rows}
                rowKey={(tx) => tx.id}
                dimmed={list.isFetching}
                sortColumn={sort.column}
                sortDirection={sort.direction}
                onSortChange={(column, direction) => {
                  // Two states, like the activity list: a null flips rather
                  // than clears, because this endpoint always orders by something.
                  setSort((current) =>
                    column && isSortable(column)
                      ? { column, direction: direction ?? 'asc' }
                      : {
                          ...current,
                          direction: current.direction === 'asc' ? 'desc' : 'asc',
                        },
                  );
                  setPage(1);
                }}
                pagination={{
                  page,
                  pageSize: TABLE_PAGE_SIZE,
                  total,
                  onPageChange: setPage,
                  noun: [t('table.row'), t('table.rows')],
                }}
                empty={<EmptyState icon={config.icon} message={t('transactions.noMatches')} />}
              />
            </div>
          </>
        )}
      </AsyncBoundary>

      <TransactionDetails tx={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/** A short, quotable reference — what a client reads out to support. */
function Reference({ id }: { id: string }) {
  return <span className="font-mono">#{id.slice(0, 8).toUpperCase()}</span>;
}
