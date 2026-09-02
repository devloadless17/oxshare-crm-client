'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, type Column } from '@/components/data-table';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { paymentsApi, type Transfer } from '@/lib/api/payments';
import { SignedAmount } from '@/components/money/signed-amount';
import { formatDealTime } from '@/lib/account-stats';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Money in and out of THIS account: the wallet transfers that funded it and the
 * ones that took funds back.
 *
 * ## Live accounts only — and the caller enforces that, not this component
 *
 * A demo account cannot have a transfer. `TransfersService` refuses a demo
 * destination, `/trading/accounts/transferable` never offers one, and the
 * transfer screen cannot select one. So for a demo account this list is
 * guaranteed empty, and an empty "Deposits and withdrawals" panel on a practice
 * account is not a neutral blank: it invites a client to look for the button
 * that would fill it, on an account where real money is not the point.
 *
 * The page therefore does not render this at all for demo. That decision is
 * deliberately NOT made here — a component that silently renders nothing is a
 * component whose absence from a screen is invisible in review.
 *
 * ## Why transfers and not the MT5 balance deals
 *
 * Both describe money moving on the account, and they are different records.
 * MT5's balance deals are in the activity history above, as the trading server
 * reports them. THIS is the CRM's own record of the same movements: it carries
 * the state a client actually needs — a transfer can be `pending` while the
 * bridge confirms, and that is the state somebody is looking for when they ask
 * where their money went. A deal only exists once it has already happened.
 *
 * ## Filtered in the browser, and that is bounded
 *
 * `GET /payments/transfers` returns the client's whole transfer history as a
 * bare array with no query parameters, so filtering here covers the real set —
 * the same rule, and the same caveat, that `/transactions` carries. **If that
 * endpoint ever grows paging, this must move server-side**: filtering one page
 * and calling it this account's history would under-report a client's own money.
 */
export function AccountTransactions({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const transfers = useResource(keys.transactions.transfers(), (signal) =>
    paymentsApi.getTransfers(signal),
  );

  /*
   * A NEW array every time, never a sort or splice on `transfers.data` — that
   * is React Query's cached object, and mutating it corrupts every other reader
   * of the same key. The transactions screen carries a test pinning exactly this.
   */
  const rows = React.useMemo(
    () => (transfers.data ?? []).filter((row) => row.tradingAccountId === accountId),
    [transfers.data, accountId],
  );

  const columns = React.useMemo(() => buildColumns(currency), [currency]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('accounts.transactionsTitle')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('accounts.transactionsNote')}</p>
        </div>
        {/* `?account=` for the same reason as the card on /accounts — this panel
            is about ONE account and already holds its id, so sending the client
            to an empty picker asks a question they have answered by being here.
            Outside the Button, which renders through Slot. See
            use-preselected-transfer.ts. */}
        <Button asChild variant="outline" size="sm">
          <Link href={`/transfer?account=${accountId}`}>{t('accounts.fundAccount')}</Link>
        </Button>
      </header>

      <AsyncBoundary
        status={transfers.status}
        label={t('accounts.transactionsLoading')}
        endpoints={['GET /payments/transfers']}
        onRetry={() => void transfers.refetch()}
        errorMessage={apiErrorMessage(transfers.error, t('accounts.transactionsLoadFailed'))}
        error={transfers.error}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          dimmed={transfers.isFetching}
          empty={<EmptyState icon={Wallet} message={t('accounts.transactionsEmpty')} />}
          clientPagination={{
            pageSize: 10,
            noun: [t('accounts.transfer'), t('accounts.transfersPlural')],
          }}
        />
      </AsyncBoundary>
    </section>
  );
}

/**
 * The three transfer states, mapped to copy and colour.
 *
 * `pending` is the one that earns its row: a wallet→account transfer HOLDS the
 * amount while the bridge confirms, so a client who cannot see it has money that
 * has left their wallet and not arrived. Rendering only settled rows would hide
 * exactly the case somebody came here to check.
 */
const STATES: Record<string, { key: MessageKey; className: string }> = {
  settled: {
    key: 'accounts.stateSettled',
    className: 'bg-success/10 text-success border-success/20',
  },
  pending: {
    key: 'accounts.statePending',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  failed: {
    key: 'accounts.stateFailed',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

function buildColumns(currency: string): Column<Transfer>[] {
  return [
    {
      header: t('accounts.colTime'),
      cell: (row) => (
        <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.createdAt)}</span>
      ),
      sortable: true,
      sortKey: 'createdAt',
      sortType: 'date',
    },
    {
      header: t('accounts.colDirection'),
      /*
       * Named from the ACCOUNT's point of view, because that is the page the
       * reader is on: `wallet_to_account` is a deposit INTO this account.
       * Labelling it "wallet to account" would make the reader work out which
       * side they are standing on, on a row that also carries a sign.
       */
      cell: (row) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {row.direction === 'wallet_to_account' ? (
            <ArrowDownLeft className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          )}
          {row.direction === 'wallet_to_account'
            ? t('accounts.directionDeposit')
            : t('accounts.directionWithdrawal')}
        </span>
      ),
    },
    {
      header: t('accounts.colAmount'),
      align: 'right',
      sortable: true,
      sortKey: 'amount',
      // decimal.js ordering, so '9' does not outrank '100'.
      sortType: 'money',
      /*
       * `SignedAmount`, the same component `/transactions`, the wallet's activity
       * list and the dashboard use — not a fourth copy of the sign-and-colour
       * ternary.
       *
       * This cell WAS that fourth copy, and it had already drifted in exactly the
       * way `SignedAmount`'s own doc predicts: a deposit was green and a
       * withdrawal inherited the table's foreground, so the only thing separating
       * money leaving this account from money arriving was a `−` one character
       * wide. Sharing the component is what stops the pair diverging again.
       *
       * `direction` is TRANSLATED, not passed through: a transfer's own field
       * names the wallet's side (`wallet_to_account`), while `SignedAmount` takes
       * the reader's side. On this page the reader is standing on the ACCOUNT, so
       * `wallet_to_account` is the deposit — the same point of view the direction
       * column above already commits to, and reversing one without the other
       * would put a green `+` beside the word "Withdrawal".
       *
       * `row.currency` rather than the account's, so a transfer that crossed
       * currencies is labelled with its own.
       */
      cell: (row) => (
        <SignedAmount
          direction={row.direction === 'wallet_to_account' ? 'deposit' : 'withdrawal'}
          amount={row.amount}
          currency={row.currency || currency}
        />
      ),
    },
    {
      header: t('accounts.colState'),
      /*
       * The BADGE alone, matching `/transactions`.
       *
       * `failureReason` used to print underneath it. The intent was sound — a
       * failed row that does not say why sends the client to support to ask a
       * question the server already answered — but a provider's own sentence
       * wrapped across two lines inside a status cell made this the widest column
       * on the table and the state itself the hardest thing in it to read. The
       * status column answers WHAT the state is; `/transactions` reached the same
       * conclusion and dropped it for the same reason.
       *
       * Note this leaves the reason with nowhere to surface on this page. That is
       * the accepted cost of the trade, not an oversight: if a failed transfer
       * needs to explain itself, the place for it is a row detail or a tooltip —
       * somewhere it can use a full line without competing with the badge.
       */
      cell: (row) => {
        // Widened at the lookup, typed at the map: a backend that adds a state
        // before this app is redeployed must render something rather than throw.
        const state = STATES[row.state];
        return (
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              state?.className ?? 'bg-muted text-muted-foreground border-border'
            }`}
          >
            {state ? t(state.key) : row.state}
          </span>
        );
      },
    },
  ];
}

/** 24-hour and shared, so a day boundary stays visible — see `formatDealTime`. */
function formatDateTime(value: string): string {
  return formatDealTime(value, t('accounts.unknownValue'));
}
