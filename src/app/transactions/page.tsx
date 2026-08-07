'use client';

import * as React from 'react';
import { Receipt } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { AsyncBoundary } from '@/components/async-boundary';
import {
  applyFilters,
  INITIAL_FILTERS,
  STATE,
  TransactionFilters,
  type Filters,
} from '@/components/transactions/transaction-filters';
import { apiErrorMessage } from '@/lib/api/errors';
import { paymentsApi, type Transaction } from '@/lib/api/payments';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's own transaction history — CORE-13's state machine, client side.
 *
 * This screen existed as a dead nav link for months while
 * `GET /payments/transactions` was already being served. The audit's closing
 * note names why that matters more than it looks: a funded client who cannot
 * enumerate their own money movements cannot detect an error in them, which
 * makes the ledger's correctness unverifiable by the only party with the
 * incentive to check it.
 *
 * Money is rendered through `formatMoney` (decimal.js, strings in and out) and
 * never coerced — `Number()` and `parseFloat` are lint errors on this path.
 *
 * The filter toolbar and the narrowing rules live in
 * `components/transactions/transaction-filters.tsx`, including the note on why
 * filtering client-side is correct here and what would change that.
 */
export default function TransactionsPage() {
  /*
   * `/payments/*` sits behind `EmailVerifiedGuard`, so for an unverified client
   * this request is a guaranteed 403 — and it fired on every visit and on every
   * window refocus, filling the server log with expected authorization failures
   * that bury the unexpected ones.
   *
   * The UI is unchanged: `AsyncBoundary` already renders a "not permitted" state
   * for `forbidden`, so reporting that status directly gives the client exactly
   * the same screen without asking a question we already know the answer to.
   *
   * Reported as `forbidden` rather than left `loading`: a disabled query stays
   * pending forever, which would spin indefinitely instead of explaining itself.
   */
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;

  const transactions = useResource(
    ['transactions'],
    (signal) => paymentsApi.getTransactions(signal),
    { enabled: !emailUnverified },
  );

  const status = emailUnverified ? 'forbidden' : transactions.status;
  const rows = React.useMemo(() => transactions.data ?? [], [transactions.data]);

  const [filters, setFilters] = React.useState<Filters>(INITIAL_FILTERS);
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  /*
   * The currencies actually present, derived from the rows rather than from a
   * hardcoded list.
   *
   * A fixed ['USD','USDT'] would offer a filter that matches nothing the moment
   * an operator adds a currency, and would keep offering one that was removed.
   * The set the client can filter by is exactly the set they hold.
   */
  const currencies = React.useMemo(
    () => Array.from(new Set(rows.map((row) => row.currency))).sort(),
    [rows],
  );

  const visible = React.useMemo(() => applyFilters(rows, filters), [rows, filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('transactions.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('transactions.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={status}
        label={t('transactions.loading')}
        endpoints={['GET /payments/transactions']}
        onRetry={() => void transactions.refetch()}
        errorMessage={apiErrorMessage(transactions.error, t('transactions.loadFailed'))}
        error={transactions.error}
      >
        {/*
          The whole-history empty state, checked BEFORE the filter bar renders.

          A client with no transactions at all should not be shown six filter
          controls over nothing — that reads as a broken screen rather than an
          empty one. Filters appear only once there is something to filter.
        */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{t('transactions.empty')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('transactions.emptyBody')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <TransactionFilters
              filters={filters}
              currencies={currencies}
              onChange={update}
              onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">{t('transactions.colDate')}</th>
                      <th className="px-4 py-3 font-semibold">{t('transactions.colType')}</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        {t('transactions.colAmount')}
                      </th>
                      <th className="px-4 py-3 font-semibold">{t('transactions.colCurrency')}</th>
                      <th className="px-4 py-3 font-semibold">{t('transactions.colStatus')}</th>
                      <th className="px-4 py-3 font-semibold">{t('transactions.colReference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/*
                      A filter matching nothing is a row INSIDE the table, not a
                      replacement for it. Swapping the table for a card would
                      take the column headers with it — which are what tell the
                      client what was searched — and change the page's shape, so
                      the filter controls above would move under the cursor.
                    */}
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <p className="text-sm font-semibold">{t('transactions.noMatches')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('transactions.noMatchesBody')}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      visible.map((tx) => <Row key={tx.id} tx={tx} />)
                    )}
                  </tbody>
                </table>
              </div>

              {/* The count, always — so "4 rows" is never mistaken for "4 rows
                  exist" when 37 do. */}
              <div className="border-t border-border bg-muted/20 px-4 py-2.5">
                <span className="text-[11px] text-muted-foreground">
                  {t('transactions.showingCount', { shown: visible.length, total: rows.length })}
                </span>
              </div>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  /*
   * `state` is a plain `string` here even though `STATE` is keyed by the
   * generated enum, and the two disagreeing on purpose is the point.
   *
   * The MAP is typed so a state added to the schema fails the build rather than
   * quietly falling through — that is what caught `failure` sitting where the
   * enum says `failed`. The LOOKUP is widened because a deployed backend can
   * start returning a new state before this app is redeployed, and at runtime
   * that has to render something rather than throw on a client's history.
   *
   * So: unknown at compile time is an error, unknown at runtime is the raw
   * value below.
   */
  const meta: { key: MessageKey; className: string } | undefined = (
    STATE as Record<string, { key: MessageKey; className: string }>
  )[state];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        meta?.className ?? 'border-border bg-muted text-muted-foreground'
      }`}
    >
      {/*
        An unrecognised state renders its raw value rather than nothing. A new
        state added server-side should look unfamiliar here, not invisible —
        blank cells are how a client concludes the screen is broken.
      */}
      {meta ? t(meta.key) : state}
    </span>
  );
}

function Row({ tx }: { tx: Transaction }) {
  const isDeposit = tx.direction === 'deposit';
  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {new Date(tx.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3 font-medium">
        {isDeposit ? t('transactions.deposit') : t('transactions.withdrawal')}
      </td>
      <td
        className={`px-4 py-3 text-right font-mono font-semibold whitespace-nowrap ${
          isDeposit ? 'text-success' : 'text-foreground'
        }`}
      >
        {/*
          Signed for the reader, not by arithmetic: `amount` is stored unsigned
          with the direction in its own column, and the prefix is a display
          concern. Doing this with a subtraction would put a number where §6.1
          requires a string.
        */}
        {isDeposit ? '+' : '−'}
        {formatMoney(tx.amount, tx.currency)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{tx.currency}</td>
      <td className="px-4 py-3">
        <StateBadge state={tx.state} />
        {tx.rejectionReason && (
          <div className="mt-1 max-w-[16rem] text-[11px] text-muted-foreground sm:max-w-[240px]">
            {tx.rejectionReason}
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
        {tx.providerRef ?? '—'}
      </td>
    </tr>
  );
}
