'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Info, LineChart, MonitorDown } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's MT5 trading accounts, live and demo.
 *
 * ## What this screen is allowed to say
 *
 * This file was a `BackendPending` placeholder, and its predecessor is the
 * reason that was the correct state rather than a gap: an earlier version
 * rendered a fixed "No Active Trading Accounts" empty state for everyone,
 * unconditionally, with no request behind it — so a client holding three live
 * accounts was told they had none. That is the same failure as the wallet
 * showing a hardcoded `$0.00` to somebody holding $700.
 *
 * `GET /trading/accounts` now exists, so this screen renders real rows. The rule
 * it inherits is unchanged: a failed request shows an error with a retry, and an
 * empty list is only ever drawn after the server has actually said the list is
 * empty.
 *
 * ## Balance is shown; equity is NOT, and the screen says so
 *
 * `balance` is the CRM-held figure — what a wallet→account transfer credits —
 * and it is genuinely the number this system owns. Equity, margin, free margin
 * and open positions are computed from live prices against open trades, and
 * there is no MT5 bridge, so nothing here holds them.
 *
 * The note under the balance states that in the UI rather than only in a
 * comment. A trading screen that shows a figure labelled only "Balance" invites
 * a trader to read it as equity, and those differ by every open position — which
 * on a losing position is the difference between "I have $5,000" and a margin
 * call.
 */
export default function AccountsPage() {
  const accounts = useResource(['trading-accounts'], (signal) => tradingApi.getAccounts(signal));

  /*
   * `/trading/*` sits behind `EmailVerifiedGuard`, so for an unverified client
   * the request is a guaranteed 403. Reporting it directly gives the same
   * "not permitted" screen without asking a question whose answer is already
   * known — the same treatment `/transactions` gives the payments API, and for
   * the same reason: expected authorization failures in the log bury the
   * unexpected ones.
   */
  const { user } = useUser();
  const emailUnverified = user !== null && user.emailVerified === false;
  const status = emailUnverified ? 'forbidden' : accounts.status;

  const rows = accounts.data ?? [];
  const live = rows.filter((row) => row.environment === 'live');
  const demo = rows.filter((row) => row.environment === 'demo');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('accounts.subtitle')}</p>
        </div>
        {/* The terminal is where these accounts are actually traded, so the
            download sits on this screen as well as in the rail. */}
        <Button asChild variant="outline" size="sm">
          <Link href="/platforms">
            <MonitorDown className="h-4 w-4" aria-hidden="true" />
            {t('nav.platforms')}
          </Link>
        </Button>
      </div>

      <AsyncBoundary
        status={status}
        label={t('accounts.loading')}
        endpoints={['GET /trading/accounts']}
        onRetry={() => void accounts.refetch()}
        errorMessage={apiErrorMessage(accounts.error, t('accounts.loadFailed'))}
        error={accounts.error}
      >
        {rows.length === 0 ? (
          /*
           * Drawn only after the server has said the list is empty — never as a
           * default. See the file note.
           *
           * FILLS the page, for the reason `/transactions` records: sized in
           * viewport units because the layout is `min-h-screen` with no unbroken
           * `h-full` chain, so a percentage height would collapse to its
           * content. `justify-center` centres the message in that space rather
           * than pinning it under the heading.
           */
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
            <LineChart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{t('accounts.empty')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('accounts.emptyBody')}</p>
          </div>
        ) : (
          // Fills the page, matching the empty state and the loader so the
          // screen keeps one shape across all three states. Viewport units
          // rather than `h-full` — the layout is `min-h-screen` with no unbroken
          // `h-full` chain, so a percentage height would collapse silently.
          <div className="flex min-h-[60vh] flex-col space-y-8">
            {/*
              What the balance means, said ONCE at the top rather than repeated
              on every card. Repeating it per card would bury the figures it is
              meant to qualify.
            */}
            <p className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <span>{t('accounts.balanceNote')}</span>
            </p>

            <AccountSection
              heading={t('accounts.liveHeading')}
              note={t('accounts.liveNote')}
              count={t('accounts.liveCount', { count: live.length })}
              accounts={live}
              tone="live"
            />

            <AccountSection
              heading={t('accounts.demoHeading')}
              note={t('accounts.demoNote')}
              count={t('accounts.demoCount', { count: demo.length })}
              accounts={demo}
              tone="demo"
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

/**
 * One environment's accounts.
 *
 * Live and demo are kept in SEPARATE sections rather than mixed into one list
 * with a tag, because the distinction is whether the money is real. A trader
 * scanning for an account acts on the first plausible match, and a demo row
 * sitting between two live ones is the arrangement that makes the wrong one
 * plausible. The server already orders live before demo for the same reason.
 *
 * A section with no accounts still renders, saying so. Hiding it would leave a
 * client unable to tell "I have no demo accounts" from "this portal does not do
 * demo accounts".
 */
function AccountSection({
  heading,
  note,
  count,
  accounts,
  tone,
}: {
  heading: string;
  note: string;
  count: string;
  accounts: TradingAccount[];
  tone: 'live' | 'demo';
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{heading}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">{count}</span>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          {t('accounts.noneOfKind')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} tone={tone} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The four status values, mapped to copy and colour. */
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

function AccountCard({ account, tone }: { account: TradingAccount; tone: 'live' | 'demo' }) {
  const isLive = tone === 'live';
  /*
   * Widened at the lookup, typed at the map. A backend that starts returning a
   * new status before this app is redeployed must render something rather than
   * throw on a client's account list — the same split `StateBadge` uses on the
   * transactions screen.
   */
  const status: { key: MessageKey; className: string } | undefined = (
    STATUS as Record<string, { key: MessageKey; className: string }>
  )[account.status];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
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

          <p className="mt-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t('accounts.loginLabel')}
          </p>
          {/*
            The login is nullable — there is no MT5 bridge, so a CRM-side account
            has none until one is assigned. "Being issued" is the honest label;
            an em dash alone would read as missing data rather than as pending.
          */}
          {account.login ? (
            <CopyableLogin login={account.login} />
          ) : (
            <p className="font-mono text-lg font-bold text-muted-foreground">
              {t('accounts.loginPending')}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
          {t('accounts.balanceLabel')}
        </p>
        {/* A decimal string through `formatMoney` — never coerced. */}
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(account.balance, account.currency)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
        <Detail label={t('accounts.currencyLabel')} value={account.currency} />
        <Detail
          label={t('accounts.leverageLabel')}
          value={
            account.leverage
              ? t('accounts.leverageValue', { ratio: account.leverage })
              : t('accounts.unknownValue')
          }
        />
        <Detail
          label={t('accounts.tierLabel')}
          value={account.tier ?? t('accounts.unknownValue')}
        />
        <Detail
          label={t('accounts.groupLabel')}
          value={account.mt5Group ?? t('accounts.unknownValue')}
        />
        <Detail label={t('accounts.openedLabel')} value={formatDate(account.createdAt)} />
      </dl>

      {/*
        Funding is offered on LIVE, ACTIVE accounts only — the same pair the
        server's `/transferable` route narrows to. A transfer to a demo account
        would be a real-money loss with no counterparty, and one to a suspended
        account is refused after the client has already committed to it.
      */}
      {isLive && account.status === 'active' && (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/transfer">{t('accounts.fundAccount')}</Link>
        </Button>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}

/**
 * The MT5 login, with a copy button.
 *
 * The login is what a client types into the terminal, so copying it is the
 * single most likely thing they came to this screen to do. A failed copy says so
 * rather than appearing to work — `navigator.clipboard` is unavailable over
 * plain HTTP and can be denied by permission, and a button that silently does
 * nothing is the one control a client is certain they used correctly.
 */
function CopyableLogin({ login }: { login: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(login);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-bold tracking-wide">{login}</span>
        <button
          type="button"
          onClick={() => void copy()}
          // Icon-only, so it needs a name of its own.
          aria-label={t('accounts.copyLogin')}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      {/* Announced, not just shown. */}
      <span role="status" className="sr-only">
        {copied ? t('accounts.copiedLogin') : ''}
      </span>
      {failed && (
        <p role="alert" className="text-[11px] text-destructive">
          {t('partner.copyFailed')}
        </p>
      )}
    </div>
  );
}

/**
 * A date in the reader's own locale.
 *
 * Guarded because the value arrives as a string from the API: an unparseable one
 * would otherwise render as "Invalid Date" on a screen a client reads to confirm
 * their account is in order.
 */
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('accounts.unknownValue') : date.toLocaleDateString();
}
