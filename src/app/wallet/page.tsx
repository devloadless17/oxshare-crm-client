'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { MoneyAction } from '@/components/kyc/money-action';
import { Button } from '@/components/ui/button';
import { WalletCarousel, type CarouselEntry } from '@/components/wallet/wallet-carousel';
import { useUser } from '@/context/UserContext';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi } from '@/lib/api/wallet';
import { paymentsApi, type Transaction } from '@/lib/api/payments';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's balances, and the three things they can do with them.
 *
 * ## The layout, top to bottom
 *
 * A CAROUSEL of wallet cards, then ONE row of three actions, then recent
 * activity. Each of those is a deliberate choice:
 *
 *  - The carousel keeps a card at a readable size. Two side by side on a laptop
 *    shrinks both until the balance competes with the chrome around it.
 *  - The actions sit ONCE, under the carousel, rather than on every card.
 *    Repeated per card they would look like they act on that card alone — and
 *    /deposit, /withdraw and /transfer each open a screen where the currency is
 *    chosen anyway, so they never did.
 *  - Recent activity is here because "what is my balance" and "why is it that"
 *    are the same question. Sending a client to another screen to answer the
 *    second half is the reason this page felt empty.
 *
 * ## A missing wallet is not a zero
 *
 * The rule the whole screen turns on, and the reason it exists: this page once
 * rendered a literal `$0.00` while `GET /wallet` worked, so a client holding
 * $700 was shown nothing. A currency absent from the response has genuinely NOT
 * BEEN OPENED — a different sentence from "you have no money", and rendered as
 * one. `WalletCard` carries that; the redesign did not relax it.
 */

/**
 * Presentation order for the cards, and the only place the two currencies are
 * named on this screen.
 *
 * `WalletCurrency` is the generated enum, so adding a third currency
 * backend-side makes this a compile error rather than a card that silently never
 * renders.
 *
 * MESSAGE KEYS, not resolved strings — the same shape as `NAV_ITEMS`, and for
 * the reason `kycNavBadge` records: `t()` at module scope is evaluated once at
 * import and never again, so a constant built that way keeps the language it was
 * imported in for the life of the tab. `t()` is called at render instead.
 */
const CURRENCIES: CarouselEntry[] = [
  { code: 'USD', label: 'wallet.usdWallet' },
  { code: 'USDT', label: 'wallet.usdtWallet' },
];

/** How many movements the activity list shows before "view all". */
const RECENT_LIMIT = 6;

export default function WalletPage() {
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));
  const { user } = useUser();

  /*
   * `/payments/*` sits behind `EmailVerifiedGuard`, so for an unverified client
   * this request is a guaranteed 403 on every visit and every window refocus,
   * filling the log with expected authorization failures that bury the
   * unexpected ones. Not asking is the right fix — the panel below simply does
   * not render for them, and `/wallet` itself still works.
   */
  const emailUnverified = user !== null && user.emailVerified === false;
  /*
   * The RECENT panel asks the server for exactly what it shows.
   *
   * `limit: RECENT_LIMIT` rather than fetching a page and slicing it. The
   * endpoint filters, orders and pages in the database now, so "the newest six"
   * is a request it can answer — and asking for a hundred rows to render six was
   * only ever defensible while the whole array arrived anyway.
   *
   * The query key carries the limit, so this cache entry cannot collide with the
   * transactions screen's own paged one.
   */
  const transactions = useResource(
    ['transactions', { limit: RECENT_LIMIT }],
    (signal) => paymentsApi.getTransactions({ limit: RECENT_LIMIT }, signal),
    { enabled: !emailUnverified },
  );

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency as string, w]));

  /*
   * The name embossed on the card foot.
   *
   * Undefined rather than a placeholder when the profile has no name: this app
   * once rendered the literal "Client User" for a null user on the
   * customer-facing portal, which is fabricated identity in the same family as a
   * fabricated balance. The card omits the line instead.
   */
  const holder = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined;

  // Already the newest `RECENT_LIMIT`, ordered by the database — no slice.
  const recent = transactions.data?.items ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('wallet.heading')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('wallet.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={wallets.status}
        label={t('wallet.loading')}
        endpoints={['GET /wallet']}
        onRetry={() => wallets.refetch()}
        errorMessage={apiErrorMessage(wallets.error, t('wallet.loadFailed'))}
        error={wallets.error}
      >
        <div className="space-y-8">
          <div className="space-y-4">
            <WalletCarousel entries={CURRENCIES} byCurrency={byCurrency} holder={holder} />

            {/*
              The three actions, ONCE, beneath the carousel.

              All the same variant — no promoted "primary". A client arriving at
              their wallet is as likely to be withdrawing or moving funds to an
              account as topping up, and a filled button says "this is the one
              you want". Being wrong about that on a money screen pushes people
              toward an action they did not come for.

              `basis-0` with `flex-1` makes them share the row exactly; `flex-1`
              alone distributes leftover space, so widths would track label
              lengths and the row would read as ranked again by accident.
            */}
            <div className="flex max-w-md gap-2">
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
          </div>

          {/* Not rendered for an unverified client — the request behind it is
              never made, so there is nothing honest to show. */}
          {!emailUnverified && (
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border p-5">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-link" aria-hidden="true" />
                  <h2 className="text-sm font-bold">{t('wallet.recentHeading')}</h2>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/transactions">{t('dashboard.viewAllTransactions')}</Link>
                </Button>
              </div>

              {recent.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold">{t('wallet.recentEmpty')}</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    {t('wallet.recentEmptyBody')}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((tx) => (
                    <ActivityRow key={tx.id} tx={tx} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function ActivityRow({ tx }: { tx: Transaction }) {
  const isDeposit = tx.direction === 'deposit';
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isDeposit ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
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
        {/*
          Signed for the reader, not by arithmetic: `amount` is stored unsigned
          with the direction in its own column, so the prefix is a display
          concern. A subtraction would put a number where §6.1 requires a string.
        */}
        <p
          className={`font-mono text-sm font-semibold whitespace-nowrap ${
            isDeposit ? 'text-success' : 'text-foreground'
          }`}
        >
          {isDeposit ? '+' : '−'}
          {formatMoney(tx.amount, tx.currency)}
        </p>
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
