'use client';

import { Receipt } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { AsyncBoundary } from '@/components/async-boundary';
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
 */

/** The five states `transactions.state` can hold, mapped to copy and colour. */
const STATE: Record<string, { key: MessageKey; className: string }> = {
  pending: {
    key: 'transactions.statePending',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  approved: { key: 'transactions.stateApproved', className: 'bg-info/10 text-info border-info/20' },
  success: {
    key: 'transactions.stateSuccess',
    className: 'bg-success/10 text-success border-success/20',
  },
  rejected: {
    key: 'transactions.stateRejected',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  failure: {
    key: 'transactions.stateFailure',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

function StateBadge({ state }: { state: string }) {
  const meta = STATE[state];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        meta?.className ?? 'bg-muted text-muted-foreground border-border'
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
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
        {new Date(tx.createdAt).toLocaleString()}
      </td>
      <td className="py-3 pr-4 font-medium">
        {isDeposit ? t('transactions.deposit') : t('transactions.withdrawal')}
      </td>
      <td
        className={`py-3 pr-4 text-right font-mono font-semibold whitespace-nowrap ${
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
      <td className="py-3 pr-4">
        <StateBadge state={tx.state} />
        {tx.rejectionReason && (
          <div className="mt-1 max-w-[16rem] text-[11px] text-muted-foreground sm:max-w-[240px]">
            {tx.rejectionReason}
          </div>
        )}
      </td>
      <td className="py-3 font-mono text-[11px] text-muted-foreground">{tx.providerRef ?? '—'}</td>
    </tr>
  );
}

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
  const rows = transactions.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('transactions.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('transactions.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={status}
        label={t('transactions.loading')}
        endpoints={['GET /payments/transactions']}
        onRetry={() => void transactions.refetch()}
        errorMessage={apiErrorMessage(transactions.error, t('transactions.loadFailed'))}
        error={transactions.error}
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{t('transactions.empty')}</p>
            <p className="text-xs text-muted-foreground max-w-sm">{t('transactions.emptyBody')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-semibold">{t('transactions.colDate')}</th>
                  <th className="pb-2 pr-4 font-semibold">{t('transactions.colType')}</th>
                  <th className="pb-2 pr-4 font-semibold text-right">
                    {t('transactions.colAmount')}
                  </th>
                  <th className="pb-2 pr-4 font-semibold">{t('transactions.colStatus')}</th>
                  <th className="pb-2 font-semibold">{t('transactions.colReference')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <Row key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
