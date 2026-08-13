'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  LineChart,
  Receipt,
  TrendingUp,
  Wallet as WalletIcon,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { AsyncBoundary } from '@/components/async-boundary';
import { MoneyAction } from '@/components/kyc/money-action';
import {
  AccountsPanel,
  Empty,
  Panel,
  PositionsPanel,
  StatTile,
} from '@/components/dashboard/dashboard-panels';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { dashboardApi, type Dashboard } from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { SignedAmount } from '@/components/money/signed-amount';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's landing page, rendered from one request.
 *
 * ## What this replaces, and the rule it inherits
 *
 * The dashboard was two cards: a KYC prompt and a download link. It had been
 * stripped to that on purpose — the version before it carried stat tiles reading
 * "0 trading accounts" and "0 pending transactions" with NO endpoint behind
 * either, so a client holding three accounts read zero. Emptying it was the
 * right call at the time, because an emptier screen that tells the truth beats a
 * full one that invents figures.
 *
 * Every number here now comes from `GET /dashboard`, which counts rows. Nothing
 * is derived, projected or defaulted.
 *
 * ## The positions panel is the one to be careful with
 *
 * It renders empty for everyone, because nothing writes to `positions` until an
 * MT5 bridge exists. The QUERY is real, so the emptiness is a database answer —
 * and the copy says trades are not SYNCED rather than "you have no trades",
 * because a client who traded this morning would still see zero here and the
 * second sentence would be a lie told to their face. See `dashboard-panels.tsx`.
 */
export function DashboardBody() {
  const dashboard = useResource<Dashboard>(['dashboard'], (signal) => dashboardApi.get(signal));

  /*
   * `/dashboard` sits behind `EmailVerifiedGuard`, so for an unverified client
   * the request is a guaranteed 403. Reporting it directly gives the same
   * "not permitted" screen without asking a question whose answer is known —
   * the same treatment `/transactions` and `/accounts` give their endpoints, and
   * for the same reason: expected authorization failures in the log bury the
   * unexpected ones.
   */
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;
  const status = emailUnverified ? 'forbidden' : dashboard.status;

  return (
    <AsyncBoundary
      status={status}
      label={t('dashboard.loading')}
      endpoints={['GET /dashboard']}
      onRetry={() => void dashboard.refetch()}
      errorMessage={apiErrorMessage(dashboard.error, t('dashboard.loadFailed'))}
      error={dashboard.error}
    >
      {dashboard.data ? <Panels data={dashboard.data} /> : null}
    </AsyncBoundary>
  );
}

function Panels({ data }: { data: Dashboard }) {
  const { wallets, recentTransactions, tradingAccounts, openPositions, stats } = data;

  return (
    <div className="space-y-6">
      {/* The figure row — four counts, each from its own table. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={WalletIcon}
          label={t('dashboard.totalBalance')}
          value={largestBalance(wallets)}
          hint={t('dashboard.totalBalanceNote')}
        />
        <StatTile
          icon={LineChart}
          label={t('dashboard.statTradingAccounts')}
          value={String(stats.totalAccounts)}
          hint={t('accounts.liveCount', { count: stats.liveAccounts })}
        />
        <StatTile
          icon={TrendingUp}
          label={t('dashboard.statOpenPositions')}
          value={String(stats.openPositions)}
        />
        <StatTile
          icon={Receipt}
          label={t('dashboard.statPendingTx')}
          value={String(stats.pendingTransactions)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Wallets as compact rows, not the full cards from /wallet — repeating
            that treatment here would make the dashboard a second wallet page. */}
        <Panel
          heading={t('dashboard.walletsHeading')}
          icon={WalletIcon}
          action={{ href: '/wallet', label: t('nav.wallet') }}
        >
          {wallets.length === 0 ? (
            <Empty title={t('dashboard.walletsEmpty')} body={t('dashboard.walletsEmptyBody')} />
          ) : (
            <ul className="divide-y divide-border">
              {wallets.map((wallet) => (
                <li key={wallet.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{wallet.currency}</p>
                    {/* `available`, not `balance` — the figure a client can act
                        on, matching the wallet cards. */}
                    <p className="text-[11px] text-muted-foreground">{t('wallet.available')}</p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums">
                    {formatMoney(wallet.available, wallet.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* All three the same variant — no promoted "primary". A client
              arriving here is as likely to be withdrawing as topping up, and a
              filled button says "this is the one you want". */}
          <div className="flex gap-2 border-t border-border p-4">
            <MoneyAction
              href="/deposit"
              icon="deposit"
              label={t('wallet.deposit')}
              variant="outline"
              size="sm"
              className="flex-1 basis-0"
            />
            <MoneyAction
              href="/withdraw"
              icon="withdraw"
              label={t('wallet.withdraw')}
              variant="outline"
              size="sm"
              className="flex-1 basis-0"
            />
            <MoneyAction
              href="/transfer"
              icon="transfer"
              label={t('wallet.transfer')}
              variant="outline"
              size="sm"
              className="flex-1 basis-0"
            />
          </div>
        </Panel>

        {/* A PREVIEW, capped server-side. The full history has its own screen
            with real filters, so paging here would imply otherwise. */}
        <Panel
          heading={t('dashboard.recentTitle')}
          icon={Receipt}
          className="xl:col-span-2"
          action={{ href: '/transactions', label: t('dashboard.viewAllTransactions') }}
        >
          {recentTransactions.length === 0 ? (
            <Empty
              title={t('dashboard.transactionsEmpty')}
              body={t('dashboard.transactionsEmptyBody')}
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentTransactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <PositionsPanel positions={openPositions} />
      <AccountsPanel accounts={tradingAccounts} />
    </div>
  );
}

function TransactionRow({ tx }: { tx: Dashboard['recentTransactions'][number] }) {
  const isDeposit = tx.direction === 'deposit';
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isDeposit ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        }`}
      >
        {isDeposit ? (
          <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isDeposit ? t('transactions.deposit') : t('transactions.withdrawal')}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {new Date(tx.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="text-end">
        <SignedAmount
          direction={tx.direction}
          amount={tx.amount}
          currency={tx.currency}
          className="block text-sm whitespace-nowrap"
        />
        <StateBadge state={tx.state} />
      </div>
    </li>
  );
}

/** The five transaction states, mapped to copy and colour. */
const STATE: Record<string, { key: MessageKey; className: string }> = {
  pending: { key: 'transactions.statePending', className: 'text-warning' },
  approved: { key: 'transactions.stateApproved', className: 'text-info' },
  success: { key: 'transactions.stateSuccess', className: 'text-success' },
  rejected: { key: 'transactions.stateRejected', className: 'text-destructive' },
  failure: { key: 'transactions.stateFailure', className: 'text-destructive' },
};

function StateBadge({ state }: { state: string }) {
  const meta = STATE[state];
  // An unrecognised state renders its raw value rather than nothing: a state
  // added server-side should look unfamiliar here, not invisible. Blank cells
  // are how a client concludes the screen is broken.
  return (
    <p className={`text-[10px] font-semibold ${meta?.className ?? 'text-muted-foreground'}`}>
      {meta ? t(meta.key) : state}
    </p>
  );
}

/**
 * The client's largest single-currency holding.
 *
 * ## NOT a sum across currencies, and the name says so
 *
 * A client holding $500 and 200 USDT does not hold "700" of anything. Adding
 * them needs an exchange rate, and there is no FX source in this system — the
 * same constraint that makes `TransfersService` refuse a cross-currency move
 * rather than invent a rate.
 *
 * So this reports the largest single holding, labelled with its own currency.
 * For the common case of one funded wallet it simply is that balance.
 *
 * An em dash when there are no wallets — never `$0.00`. A client with no wallet
 * has not been shown a zero balance; they have been shown that nothing is open,
 * which is the rule the whole wallet screen turns on.
 */
function largestBalance(wallets: Dashboard['wallets']): string {
  /*
   * Reduced rather than seeded from `wallets[0]`, which under
   * `noUncheckedIndexedAccess` is `T | undefined` — an index access cannot know
   * the array is non-empty. The reduce carries a definite accumulator instead of
   * asserting one, so there is no `!` to be wrong about later.
   */
  const best = wallets.reduce<Dashboard['wallets'][number] | null>((leader, wallet) => {
    if (!leader) return wallet;
    // decimal.js, never `Number()`: these are NUMERIC(28,8) strings and the
    // comparison must not round-trip through a float.
    return new Decimal(wallet.available).greaterThan(new Decimal(leader.available))
      ? wallet
      : leader;
  }, null);

  if (!best) return '—';
  return formatMoney(best.available, best.currency);
}
