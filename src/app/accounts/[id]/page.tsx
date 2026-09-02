'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { t, type MessageKey } from '@/lib/i18n';
import { AccountLivePanel } from '@/components/accounts/account-live-panel';
import { AccountPositions } from '@/components/accounts/account-positions';
import { AccountActivity } from '@/components/accounts/account-activity';
import { AccountTransactions } from '@/components/accounts/account-transactions';
import { AccountActions } from '@/components/accounts/account-actions';
import { keys } from '@/lib/query-keys';

/**
 * ONE trading account: what it holds now, what it has done, and what moved.
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
 * Demo drops the money-movement action. Everything else — the MT5 figures, the
 * statistics, the history — is identical, because MT5 tracks a demo account the
 * same way and a client practising deserves to see how they are doing. The demo
 * badge from the list carries through, so the environment is never in doubt.
 *
 * ## Four requests, not one
 *
 * The account, the live snapshot, the statistics and the history are separate
 * because they FAIL separately and one of them crosses to a server we do not
 * own. A combined endpoint would mean an unreachable bridge blanking the
 * statistics and the history too — which are database reads that were fine. The
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
   * `retry: 0` — this crosses to MT5, and there is a Refresh button right here.
   *
   * The default three retries turned one failing page load into a dozen
   * requests, each waiting out the full read timeout, all queued behind the
   * bridge's single MT5 lock. A person looking at an error with a button beside
   * it does not need the browser trying again on their behalf.
   */
  const snapshot = useResource(
    keys.mt5Live.snapshot(account.id),
    (signal) => tradingApi.getAccountSnapshot(account.id, signal),
    { retry: 0 },
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshot.refetch()}
            loading={snapshot.isFetching}
          >
            {/*
            The refresh mark while idle, the shared `Spinner` while in flight.

            This was a `RefreshCw` carrying `animate-spin` only sometimes — named
            in `ui/loader.tsx` as one of the fourteen spellings of "please wait"
            that file replaced. It froze mid-rotation for every user with
            reduce-motion on, because the blanket rule in globals.css cuts every
            animation to 0.001ms and `animate-spin` obeys it; `loader-spin`,
            which the shared Spinner uses, re-asserts the rotation past that
            rule.

            `loading` on the Button also disables it and sets `aria-busy`, which
            is why the hand-written `disabled` is gone rather than kept beside
            it. The icon is HIDDEN rather than spun so the two marks never stack —
            Button renders its Spinner ahead of the children.
          */}
            {!snapshot.isFetching && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {snapshot.isFetching ? t('accounts.liveRefreshing') : t('accounts.liveRefresh')}
          </Button>
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

      <AccountActivity accountId={account.id} currency={account.currency} />

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
      <AccountPositions accountId={account.id} currency={account.currency} />
    </div>
  );
}
