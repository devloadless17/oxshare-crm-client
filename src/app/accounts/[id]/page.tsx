'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { useLiveAccount } from '@/hooks/use-live-account';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { t, type MessageKey } from '@/lib/i18n';
import { AccountLivePanel } from '@/components/accounts/account-live-panel';
import { AccountPositions } from '@/components/accounts/account-positions';
import { AccountTransactions } from '@/components/accounts/account-transactions';
import { AccountActions } from '@/components/accounts/account-actions';
import { keys } from '@/lib/query-keys';

/**
 * ONE trading account: what it holds now, what moved, and what is running.
 *
 * ## The rule this screen exists to keep
 *
 * It shows two balances that can legitimately disagree — MT5's live one and the
 * CRM's cached column — and it LABELS both. Two unlabelled money figures that
 * differ is worse than showing one: a client cannot tell which is theirs, and
 * whichever they act on, half the time it is the wrong one. `/wallet` learned
 * the same lesson from the other direction, where a plausible `$0.00` was shown
 * to somebody holding $700.
 *
 * ## Live and demo share this page, and differ in exactly one way
 *
 * Demo drops the money-movement panel and its action. Everything else — the MT5
 * figures, the open positions — is identical, because MT5 tracks a demo account
 * the same way and a client practising deserves to see how they are doing. The
 * demo badge from the list carries through, so the environment is never in
 * doubt.
 *
 * ## THE ACTIVITY CARD IS GONE, and with it the trading statistics
 *
 * This page used to carry an "Activity" card between the live panel and the
 * transfers: a period picker over `GET /trading/accounts/:id/history`, rendering
 * thirteen stat figures computed from the deals in the window. The card, that
 * request and the strings behind it were removed together.
 *
 * **Know what went with it.** A client can no longer see closed-trade totals —
 * win rate, realised P/L, volume, best and worst trade — anywhere in the portal.
 * The endpoint still exists and still answers; nothing here calls it. Anybody
 * looking for those figures is not chasing a bug.
 *
 * ## Separate requests, split by what is still moving
 *
 * The account, the transfers, the live snapshot and the open positions are
 * separate requests because they FAIL separately, and the line between them is
 * whether the figure changes while it is being read:
 *
 * - **Database reads** — the account and its transfers. Both answer from our
 *   own tables, so they survive the bridge being unreachable.
 * - **Bridge reads** — the live balance panel and the open positions. These
 *   MUST cross to MT5: a balance and a floating P/L move on every tick, and a
 *   stored copy would reach the client wearing the same label as a live one.
 *
 * A combined endpoint would collapse that distinction and let an unreachable
 * bridge blank the transfers too, which is a database read that was fine. The
 * dashboard makes the opposite choice for the opposite reason: its panels are
 * read in one glance and must agree about the instant they describe.
 */
export default function AccountDetailPage() {
  /*
   * `useParams` rather than a `params` prop. This is a client component — the
   * whole screen is interactive — and in Next 16 the `params` handed to a page
   * is a PROMISE that has to be unwrapped with `use()`. Reading it from the
   * router avoids threading a server prop through a client tree for one string.
   */
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const account = useResource(keys.tradingAccounts.detail(id), (signal) =>
    tradingApi.getAccount(id, signal),
  );

  /*
   * Same treatment `/accounts` gives an unverified client: `/trading/*` sits
   * behind `EmailVerifiedGuard`, so the request is a guaranteed 403 and
   * reporting it directly gives the same "not permitted" screen without asking
   * a question whose answer is already known.
   */
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;
  const status = emailUnverified ? 'forbidden' : account.status;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ms-2">
          <Link href="/accounts">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('accounts.detailBack')}
          </Link>
        </Button>
      </div>

      <AsyncBoundary
        status={status}
        label={t('accounts.detailLoading')}
        endpoints={['GET /trading/accounts/:id']}
        onRetry={() => void account.refetch()}
        errorMessage={apiErrorMessage(account.error, t('accounts.detailLoadFailed'))}
        error={account.error}
      >
        {/*
          `unavailable` is a 404 here, and a 404 on this route means "no such
          account of YOURS" — the server does not distinguish a bad id from
          somebody else's account, deliberately. AsyncBoundary's own
          `unavailable` branch says "this endpoint is not built yet", which is
          the wrong sentence for a route that exists and answered. So the check
          happens on the data instead: rendering starts only once there is an
          account.
        */}
        {account.data ? <AccountDetail account={account.data} /> : <NotFound />}
      </AsyncBoundary>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
      <p className="text-sm font-semibold">{t('accounts.detailNotFound')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{t('accounts.detailNotFoundBody')}</p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/accounts">{t('accounts.detailBack')}</Link>
      </Button>
    </div>
  );
}

/** The four status values, mapped to copy and colour. Mirrors the list card. */
const STATUS: Record<TradingAccount['status'], { key: MessageKey; className: string }> = {
  active: {
    key: 'accounts.statusActive',
    className: 'bg-success/10 text-success border-success/20',
  },
  suspended: {
    key: 'accounts.statusSuspended',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  closed: {
    key: 'accounts.statusClosed',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

function AccountDetail({ account }: { account: TradingAccount }) {
  const isLive = account.environment === 'live';

  /*
   * Widened at the lookup, typed at the map — the same split the list card uses.
   * A backend returning a new status before this app is redeployed must render
   * something rather than throw on a client's own account screen.
   */
  const status: { key: MessageKey; className: string } | undefined = (
    STATUS as Record<string, { key: MessageKey; className: string }>
  )[account.status];

  /*
   * ── PUSHED WHILE THIS SCREEN IS OPEN ──────────────────────────────────────
   *
   * The account screen tells the server it is being looked at, and the bridge
   * reads this account on its own loop and pushes each reading over the socket
   * the browser already holds. `useLiveAccount` writes those readings into the
   * same query keys the two panels below render from, so nothing here has to
   * thread a prop or hold a second copy.
   *
   * WHY THIS EXISTS AT ALL, rather than a faster poll: every request to
   * `/accounts/:id/live` crosses the bridge and takes the single MT5 session
   * lock, so the cost scaled with VIEWERS × POLL RATE. That is what caps the
   * route at 12/min, and it is why a livelier screen could not be bought by
   * lowering the interval — a few dozen concurrent viewers already saturated
   * the one session. Pushing makes the cost scale with ACCOUNTS BEING WATCHED
   * instead: ten people on one account is one read, not ten.
   */
  const { live, positionsLive } = useLiveAccount(account.id);

  /*
   * ── THE POLL STAYS, AND SLOWS DOWN ────────────────────────────────────────
   *
   * It is not switched off when the push works, and that is the whole safety of
   * this feature. Five things leave the feed silent — the socket is down, the
   * bridge is unreachable or full, the account has no MT5 login yet, or the API
   * predates the endpoint — and none of them are distinguishable from here. So
   * the fallback is the behaviour this is falling back FROM: a ten-second poll,
   * exactly as before.
   *
   * `live` reports that READINGS ARE ARRIVING rather than that the server agreed
   * to send them, so a watch that is accepted and then goes quiet drops back to
   * ten seconds on its own within `SILENCE_MS`.
   *
   * SIXTY seconds while pushed rather than nothing at all. A pushed reading and
   * a polled one come from the same MT5 read, so the poll is not there to
   * correct the feed — it is there so a feed that dies between two of these
   * checks still leaves the screen with figures no older than a minute, and so
   * `AsyncBoundary` keeps a real error to render if the route starts failing.
   *
   * TEN SECONDS is still set by the throttle, not by taste: 12/min per client,
   * so 6/min leaves room for the focus refetch and a retry. Polling at the
   * limit would turn an ordinary tab-switch into a 429 on a money screen.
   *
   * Either way it costs nothing while nobody is looking. React Query does not
   * poll a BACKGROUND tab, so a client who leaves this open in another window
   * stops reading MT5 entirely, and `refetchOnWindowFocus` brings it current the
   * moment they come back.
   *
   * `retry: 0` stays. It crosses to MT5, and the default three retries turned
   * one failing load into a dozen requests, each waiting out the full read
   * timeout, all queued behind that same lock. With a poll running, a failed
   * read is already retried by design.
   */
  const snapshot = useResource(
    keys.mt5Live.snapshot(account.id),
    (signal) => tradingApi.getAccountSnapshot(account.id, signal),
    { retry: 0, refetchInterval: live ? 60_000 : 10_000 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                isLive
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {isLive ? t('accounts.liveTag') : t('accounts.demoTag')}
            </span>
            {status && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}
              >
                {t(status.key)}
              </span>
            )}
          </div>
          {/*
            The client's NAME leads when there is one, with the login demoted to
            the line below — and the login is never dropped, because it is what
            every statement, support ticket and MT5 terminal identifies this
            account by. Unnamed accounts keep the login as the heading, which is
            exactly what this page showed before.
          */}
          <h1
            className={`mt-2 text-2xl font-bold tracking-wide ${account.name ? '' : 'font-mono'}`}
          >
            {account.name ?? account.login ?? t('accounts.loginPending')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account.name && account.login ? (
              <span className="font-mono">{account.login} · </span>
            ) : null}
            {account.currency}
            {account.leverage
              ? ` · ${t('accounts.leverageValue', { ratio: account.leverage })}`
              : ''}
            {/*
              The PRODUCT, then the group.

              The group alone was here, and an MT5 group path in a subheading is
              a server path where a reader expects a label. The product is what
              the client chose and what they recognise; the group stays after it
              because this is the one screen where the technical identifier earns
              its place — it is what somebody quotes in a support ticket.

              Each is dropped when absent rather than dashed. A subheading is a
              run-on sentence of facts, and a missing one should shorten it, not
              punctuate a gap.
            */}
            {account.product ? ` · ${account.product}` : ''}
            {account.mt5Group ? ` · ${account.mt5Group}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            THE REFRESH BUTTON IS GONE, because the panel refreshes itself.

            It was the client doing the polling by hand: the only way to find out
            what an account was worth was to press a control, and a figure that
            is correct only when somebody clicks is one that is wrong every other
            second. The panel now reads MT5 every ten seconds while the tab is
            visible — see the note on the snapshot query.

            Nothing replaces it, deliberately. A button that duplicates a poll
            invites exactly the refresh-mashing the 12/min throttle exists to
            absorb, and the two remaining ways to force a read are both better:
            switching back to the tab refetches on focus, and a failed read still
            renders `AsyncBoundary`'s own retry.

            What DOES replace it is saying the panel is live — `AccountLivePanel`
            carries the read time, so "as of a moment ago" is on screen rather
            than implied by a button nobody pressed.
          */}
          {/*
            No "Open MetaTrader 5" button here any more.

            It existed when this screen could not show open positions and had to
            send a client elsewhere for them. It can now, so the button was a
            standing invitation to leave a page that answers the question — and
            the terminal download still has its own screen in the rail.
          */}
          {/*
            Funding, renaming and the password reset all live in ONE menu now,
            rather than as a standalone "Fund account" button beside Refresh.

            The three have nothing in common but their subject — one moves money,
            one rewrites a label, one destroys credentials — and as separate
            header buttons the destructive one sat exactly as close to the cursor
            as the harmless one. `AccountActions` also owns which of them apply:
            funding is still LIVE and ACTIVE only, matching the server's
            `/transferable` route and the list card.

            Only rendered once the account has an MT5 login. Every action inside
            reaches the trading server, so on a half-provisioned row they would
            each fail with "could not be found", which reads as a broken account
            rather than one that is still being opened.
          */}
          {account.login && <AccountActions account={account} />}
        </div>
      </div>

      <AccountLivePanel snapshot={snapshot} />

      {/*
        Deposits and withdrawals: LIVE accounts only.

        A demo account cannot receive a transfer — `TransfersService` refuses a
        demo destination and `/trading/accounts/transferable` never offers one —
        so this panel would be permanently empty there. An empty
        "Deposits and withdrawals" table on a practice account is not a neutral
        blank: it invites a client to hunt for the control that would fill it, on
        an account where real money is not the point.

        Gated HERE rather than inside the component, so its absence from a demo
        account is visible in this file rather than buried in a component that
        silently renders nothing.
      */}
      {isLive && <AccountTransactions accountId={account.id} currency={account.currency} />}

      {/*
        Open positions last, and that ordering is deliberate rather than
        leftover: it is the only panel on this page that changes while it is
        being read. Everything above settles once loaded, so putting the moving
        figures at the end lets the page come to rest from the top down.
      */}
      <AccountPositions
        accountId={account.id}
        currency={account.currency}
        /*
         * `positionsLive`, NOT `live`. The server drops the positions array when
         * an event will not fit its notification channel, so a client with many
         * open trades gets live account figures and no pushed table — and
         * passing `live` here would slow that table's own fallback poll to sixty
         * seconds on the strength of a feed it is not receiving.
         */
        live={positionsLive}
      />
    </div>
  );
}
