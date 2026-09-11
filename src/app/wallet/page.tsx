'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { MoneyAction } from '@/components/kyc/money-action';
import { Button } from '@/components/ui/button';
import { WalletCard } from '@/components/wallet/wallet-card';
import { WalletCarousel, type CarouselEntry } from '@/components/wallet/wallet-carousel';
import { useUser } from '@/context/UserContext';
import { useResource } from '@/hooks/use-resource';
import { walletApi } from '@/lib/api/wallet';
import { currenciesApi } from '@/lib/api/currencies';
import { paymentsApi, type Transaction } from '@/lib/api/payments';
import { SignedAmount } from '@/components/money/signed-amount';
import { t, type MessageKey } from '@/lib/i18n';
import { movementLabelKey } from '@/lib/movement-label';
import { keys } from '@/lib/query-keys';

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
/** How many movements the activity list shows before "view all". */
const RECENT_LIMIT = 6;

export default function WalletPage() {
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal));
  /*
   * The catalogue supplies each wallet's NAME. A failure here is not fatal —
   * `held` falls back to the code, so the cards still render — which is why this
   * is a separate resource rather than something the page blocks on.
   */
  const currencies = useResource(keys.currencies.all(), (signal) => currenciesApi.list(signal));
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
    keys.transactions.list({ limit: RECENT_LIMIT }),
    (signal) => paymentsApi.getTransactions({ limit: RECENT_LIMIT }, signal),
    { enabled: !emailUnverified },
  );

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency, w]));

  /*
   * Only the currencies this client ACTUALLY holds a wallet in.
   *
   * The carousel used to render a card per supported currency and show an
   * unopened one as an em dash with "not opened yet". That was the right fix for
   * the ORIGINAL bug — a missing wallet rendering as `$0.00`, which showed a
   * client holding $700 a zero — but it over-corrected: a client with one USD
   * wallet had to swipe past a permanent placeholder for a currency they had
   * never asked for.
   *
   * The rule that mattered survives intact, because it was never about the card:
   * a missing wallet must not be presented as a balance of nothing. Showing no
   * card at all says exactly that, and says it more plainly than a dash did.
   *
   * Opening one is not lost either — choosing a method in that currency on the
   * deposit screen creates the wallet, and the operator can open one from the
   * admin console.
   */
  /*
   * ⚠️ Derived from the client's OWN wallets, never from a list in this file.
   *
   * This filtered a hardcoded `[USD, USDT]`, so a client holding six wallets saw
   * two — while the dashboard, reading the same endpoint, counted six. Two
   * screens disagreeing about the same client's money.
   *
   * Currencies are operator data: `GET /currencies` is the catalogue, and an
   * operator adds one from the admin screen without either app redeploying. The
   * name comes from there; the CODE is the fallback, because a wallet that
   * exists must be shown even if the catalogue read failed or the currency was
   * disabled after it was opened.
   *
   * Ordered by the catalogue's `sortOrder` — the operator's own ordering, so the
   * default currency leads — with anything unknown to it last and alphabetical,
   * rather than in whatever order the wallets query returned.
   */
  const catalogue = currencies.data ?? [];
  const rank = new Map(catalogue.map((entry, index) => [entry.code, index]));
  const nameOf = new Map(catalogue.map((entry) => [entry.code, entry.name]));

  const held: CarouselEntry[] = (wallets.data ?? [])
    .map((wallet) => ({
      code: wallet.currency,
      label: nameOf.get(wallet.currency) ?? wallet.currency,
    }))
    .sort((a, b) => {
      const left = rank.get(a.code) ?? Number.MAX_SAFE_INTEGER;
      const right = rank.get(b.code) ?? Number.MAX_SAFE_INTEGER;
      return left === right ? a.code.localeCompare(b.code) : left - right;
    });

  /*
   * The lone wallet, bound once rather than indexed at three call sites —
   * `noUncheckedIndexedAccess` types `held[0]` as possibly undefined, and a
   * non-null assertion on a money screen is exactly the shortcut worth not
   * taking.
   */
  const only = held.length === 1 ? held[0] : undefined;

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
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('wallet.heading')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('wallet.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={wallets.status}
        label={t('wallet.loading')}
        endpoints={['GET /wallet']}
        onRetry={() => wallets.refetch()}
        errorMessage={t('wallet.loadFailed')}
        error={wallets.error}
      >
        <div className="space-y-6">
          <div className="space-y-4">
            {/*
              ONE wallet renders the card ALONE — no track, no arrows, no dots.
              `WalletCarousel` already hides its controls for a single entry, but
              it still wraps the card in a scroll container with snap points,
              which is machinery around something that cannot move. The card is
              the same either way; only the chrome differs.

              NO wallets renders nothing at all rather than an empty carousel.
              The actions below stay: opening a wallet is what a deposit does, so
              the way out of this state is the button already on the screen.
            */}
            {only ? (
              <div className="w-full max-w-md">
                <WalletCard
                  label={only.label}
                  currency={only.code}
                  wallet={byCurrency.get(only.code)}
                  holder={holder}
                />
              </div>
            ) : held.length > 1 ? (
              <WalletCarousel entries={held} byCurrency={byCurrency} holder={holder} />
            ) : null}

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
            /* `shrink-0` for the reason `Panel` carries it: an
               `overflow-hidden` card inside a filling flex column collapses to
               its own border rather than overflowing, and reads as a line. */
            <section className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card">
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
        {/*
          Named by `kind`, not by direction alone. This list reads the same
          endpoint as /transactions, which now includes wallet ⇄ account
          transfers — and a transfer back from an account arrives with
          `direction: 'deposit'` because that is what it did to the WALLET.
          Printing "Deposit" for it sends a client looking for a payment they
          never made.
        */}
        <p className="truncate text-sm font-medium">{t(movementLabelKey(tx))}</p>
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
        <StateBadge state={tx.state} kind={tx.kind} />
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

function StateBadge({ state, kind }: { state: string; kind?: string }) {
  /*
   * A pending TRANSFER reads "Processing", not "Pending review".
   *
   * Nobody reviews a transfer — it is waiting on the trading server. Telling a
   * client their own transfer is under review sends them looking for a desk that
   * is holding it up, and there isn't one. A withdrawal genuinely is reviewed,
   * so it keeps the original wording.
   */
  const meta =
    state === 'pending' && kind === 'transfer'
      ? { key: 'transactions.stateProcessing' as MessageKey, className: 'text-warning' }
      : STATE[state];
  // An unrecognised state renders its raw value rather than nothing: a state
  // added server-side should look unfamiliar here, not invisible. Blank cells
  // are how a client concludes the screen is broken.
  return (
    <p className={`text-[10px] font-semibold ${meta?.className ?? 'text-muted-foreground'}`}>
      {meta ? t(meta.key) : state}
    </p>
  );
}
