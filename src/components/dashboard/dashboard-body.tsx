'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  LineChart,
  Receipt,
  TrendingUp,
  Users,
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
      // See the note on the page root: the fill chain is what lets the spinner
      // centre in the remaining space instead of inside its own min-height.
      fill
    >
      {dashboard.data ? <Panels data={dashboard.data} /> : null}
    </AsyncBoundary>
  );
}

function Panels({ data }: { data: Dashboard }) {
  const { wallets, recentTransactions, tradingAccounts, openPositions, stats } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {/*
        The figure row. Every tile is a COUNT the API computed, or a balance the
        API sent — nothing here is derived from a guess, which is the rule this
        screen was emptied for once already: it used to carry tiles reading
        "0 trading accounts" with no endpoint behind them, and a client holding
        three read zero.
      */}
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          icon={WalletIcon}
          label={t('dashboard.largestBalance')}
          value={largestBalance(wallets)}
          hint={t('dashboard.largestBalanceNote')}
        />
        {/*
          The wallet COUNT, which is what survives of the wallets panel this
          replaced. Balances belong on /wallet, where each has a card and room
          for its own held figure; a second, thinner copy of that list here made
          the dashboard a worse version of the page it links to.
        */}
        <StatTile
          icon={Landmark}
          label={t('dashboard.statWallets')}
          value={String(wallets.length)}
          hint={t('dashboard.statWalletsNote')}
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
          hint={t('dashboard.statOpenPositionsNote')}
        />
        <StatTile
          icon={Receipt}
          label={t('dashboard.statPendingTx')}
          value={String(stats.pendingTransactions)}
          hint={t('dashboard.statPendingTxNote')}
        />
        {/*
          PARTNERS ONLY, and hidden rather than shown as zero.
          `stats.referredClients` is 0 for everybody who is not a partner, so a
          tile reading "0 clients introduced" would tell most of the client base
          about a programme they are not in — and read as a failure rather than
          an absence. It was the one figure the API already computed that this
          screen never showed.
        */}
        {stats.referredClients > 0 && (
          <StatTile
            icon={Users}
            label={t('dashboard.statReferred')}
            value={String(stats.referredClients)}
            hint={t('dashboard.statReferredNote')}
          />
        )}
      </div>

      {/*
        The money actions, LIFTED OUT of the wallets panel rather than removed
        with it.

        They lived inside that card, so deleting it would have taken the
        dashboard's primary calls to action with it — deposit and withdraw are
        the two things most clients open this screen to do, and the request was
        to drop a redundant balance list, not the buttons.

        `MoneyAction` rather than plain links: it puts the KYC gate in front of
        each one, so an unverified client gets an explanation instead of a form
        the API will refuse.
      */}
      <div className="flex shrink-0 flex-wrap gap-2">
        <MoneyAction
          href="/deposit"
          icon="deposit"
          label={t('wallet.deposit')}
          size="sm"
          className="flex-1 basis-40"
        />
        <MoneyAction
          href="/withdraw"
          icon="withdraw"
          label={t('wallet.withdraw')}
          variant="outline"
          size="sm"
          className="flex-1 basis-40"
        />
        <MoneyAction
          href="/transfer"
          icon="transfer"
          label={t('wallet.transfer')}
          variant="outline"
          size="sm"
          className="flex-1 basis-40"
        />
      </div>

      <div className="grid shrink-0 gap-6 xl:grid-cols-3">
        {/* A PREVIEW, capped server-side. The full history has its own screen
            with real filters, so paging here would imply otherwise. */}
        <Panel
          heading={t('dashboard.recentTitle')}
          icon={Receipt}
          className="xl:col-span-3"
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
