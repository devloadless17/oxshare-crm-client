'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, LineChart, MonitorDown } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';
import { OpenAccountButton } from '@/components/accounts/open-account-button';
import { Tabs, TabPanel, type TabDefinition } from '@/components/ui/tabs';
import { keys } from '@/lib/query-keys';

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
 * ## Balance is the CRM-held figure, and it is labelled as one
 *
 * `balance` is what a wallet→account transfer credits — genuinely the number
 * this system owns. Equity, margin and open positions are computed from live
 * prices against open trades and belong to the terminal, which is one click
 * away on this screen.
 *
 * There used to be a standing note under the tab saying exactly that. It is
 * gone: it explained a distinction the card's own label already draws, and a
 * caveat that never changes is one a reader stops seeing — along with anything
 * else placed near it.
 */
/** Two environments, in the order a client cares about them. */
const TABS: TabDefinition[] = [
  { value: 'live', label: t('accounts.liveHeading') },
  { value: 'demo', label: t('accounts.demoHeading') },
];

export default function AccountsPage() {
  /*
   * POLLED, because nothing on this page is what changes the numbers on it.
   *
   * The balance here is the CRM's mirror of MT5, written by the bridge when a
   * trade moves it — so the client is watching a value that a completely
   * different process updates, with no event on this screen to hang a refresh
   * on. Without a poll the list showed whatever it fetched on mount until the
   * client navigated away and back.
   *
   * Thirty seconds, and it is CHEAP: `GET /trading/accounts` is one indexed
   * read of `trading_accounts` in our own database. It does NOT cross to MT5 —
   * the live figures are the account detail page, on demand, behind a throttle.
   * So this tracks the mirror closely without adding a single call to the
   * bridge's serialised MT5 session.
   *
   * The remaining delay is the mirror's own, not this screen's.
   */
  const accounts = useResource(
    keys.tradingAccounts.all(),
    (signal) => tradingApi.getAccounts(signal),
    { refetchInterval: 30_000 },
  );

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

  /*
   * Every name this client has already used — across BOTH environments.
   *
   * From `rows` and not from the tab's own list, because the rule is per CLIENT
   * and the server enforces it that way: `trading_accounts_user_name_uq` is on
   * (user_id, lower(name)) with no environment in it. Reading the tab instead
   * would let a client name a live account the same as their demo one, be told
   * it was fine, and meet a 409 after pressing open.
   *
   * Passed down rather than fetched: the page is already rendering these, so
   * the check costs nothing and there is no second request to disagree with the
   * first.
   */
  const takenNames = rows.map((row) => row.name).filter((name): name is string => Boolean(name));

  /*
   * Local state rather than the URL.
   *
   * The admin console puts its tab in the query string because operators send
   * each other links to a specific settings tab. Nobody links a client to their
   * own demo tab, and adding a history entry per tab press would bury whatever
   * page they arrived from under two or three of them.
   */
  const [tab, setTab] = React.useState('live');

  /*
   * A FLEX COLUMN rather than `space-y-6`, so the tab panel can be told to take
   * whatever height is left. `<main>` is already `flex flex-col` with a bounded
   * height; this continues that chain, `AsyncBoundary fill` continues it past
   * the four states, and the panel's `flex-1` ends it at the empty card. Break
   * any link and the card falls back to its content height — which is the short
   * stub in the middle of an empty page this replaced.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('accounts.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            No create button up here any more. Each TAB owns its own, because
            the tab already answers the question the old shared dialog had to
            ask — and a header button would have to ask it again, from inside a
            tab that had already been chosen.
          */}
          {/* The terminal is where these accounts are actually traded, so the
              download sits on this screen as well as in the rail. */}
          <Button asChild variant="outline" size="sm">
            <Link href="/platforms">
              <MonitorDown className="h-4 w-4" aria-hidden="true" />
              {t('nav.platforms')}
            </Link>
          </Button>
        </div>
      </div>

      <AsyncBoundary
        status={status}
        label={t('accounts.loading')}
        endpoints={['GET /trading/accounts']}
        onRetry={() => void accounts.refetch()}
        errorMessage={apiErrorMessage(accounts.error, t('accounts.loadFailed'))}
        error={accounts.error}
        fill
      >
        {/*
          TABS rather than two stacked sections.

          Live and demo accounts are answers to different questions — "what am I
          trading" and "what am I practising with" — and a client is in one mode
          at a time. Stacked, the demo list pushed the live one off the screen
          for anybody holding several, and the empty half of the page was a
          permanent reminder of the thing they were not doing.

          It also gives each environment somewhere to put its OWN create button,
          which is what the old shared dialog was awkwardly working around.
        */}
        <Tabs tabs={TABS} value={tab} onValueChange={setTab} idPrefix="accounts" />

        <TabPanel
          value="live"
          activeValue={tab}
          idPrefix="accounts"
          className="flex min-h-0 flex-1 flex-col"
        >
          <EnvironmentPanel
            environment="live"
            accounts={live}
            takenNames={takenNames}
            emptyTitle={t('accounts.liveEmpty')}
            emptyBody={t('accounts.liveEmptyBody')}
          />
        </TabPanel>

        <TabPanel
          value="demo"
          activeValue={tab}
          idPrefix="accounts"
          className="flex min-h-0 flex-1 flex-col"
        >
          <EnvironmentPanel
            environment="demo"
            accounts={demo}
            takenNames={takenNames}
            emptyTitle={t('accounts.demoEmpty')}
            emptyBody={t('accounts.demoEmptyBody')}
          />
        </TabPanel>
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
/**
 * One environment's accounts, with the button that creates another.
 *
 * The create button sits in BOTH the populated and the empty state. The empty
 * one is the case that matters: a client with no accounts previously had no way
 * to get one, so the screen was a dead end telling them to contact support for
 * a thing the system does in a second.
 */
function EnvironmentPanel({
  environment,
  accounts,
  takenNames,
  emptyTitle,
  emptyBody,
}: {
  environment: 'live' | 'demo';
  accounts: TradingAccount[];
  /** Names this client has used on ANY account — the rule is per client, not per tab. */
  takenNames: string[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (accounts.length === 0) {
    return (
      /* `min-h-[16rem]` as a floor, not the height: on a short viewport the
         remaining space can be less than the card needs. */
      <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
        <LineChart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">{emptyTitle}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{emptyBody}</p>
        <div className="pt-1">
          <OpenAccountButton
            environment={environment}
            held={accounts.length}
            takenNames={takenNames}
            explainWhenClosed
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/*
        The balance caveat is gone. It explained that the figure was the CRM's
        deposited balance rather than live equity — true when nothing synced,
        and now just noise: the card labels the figure and the terminal is one
        click away. A permanent explanation of every number is how a screen
        stops being read at all.
      */}
      <div className="flex justify-end">
        <OpenAccountButton
          environment={environment}
          held={accounts.length}
          takenNames={takenNames}
          variant="outline"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} tone={environment} />
        ))}
      </div>
    </div>
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

          {/*
            The client's own name for the account, when they gave one.

            Above the login rather than instead of it: the login is what every
            statement, support ticket and MT5 terminal identifies this account
            by, so it stays the prominent figure. The name is how the CLIENT
            tells two of them apart, which only matters once they hold several —
            exactly the case the open-account dialog offers it for.

            Absent when unnamed, rather than falling back to the login here. A
            caption repeating the number directly beneath it is noise, and it
            would make "named 5001234" indistinguishable from unnamed.
          */}
          {account.name && (
            <p className="mt-2 truncate text-sm font-semibold" title={account.name}>
              {account.name}
            </p>
          )}

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
        {/*
          THE PRODUCT, and ONLY when there is one.

          This pair of rows used to read "TYPE —" and "GROUP —" on every card of
          every client, and both dashes were structural rather than unlucky:
          `trading_accounts.tier` is a column nothing has ever written, and
          `mt5_group` was never persisted at account creation, so neither field
          could ever hold a value. Two permanent em dashes on a card whose whole
          job is to state facts about an account teaches a client that our data
          is missing — and it is the first thing they ask support about.

          `product` is the real answer to "what kind of account is this". It is
          also the answer the client themselves gave: the open-account form asks
          for a currency and a product, so this is their own choice read back.
          The MT5 group it resolves from stays on the detail screen, where a
          server path is a technical detail somebody quoting a support ticket
          might want and not a label on a summary card.

          OMITTED rather than dashed when null. That is a real state — an
          operator may open an account directly into a group the catalogue does
          not sell, and every account opened before the group was persisted has
          none — and a row that says nothing is worse than no row at all. The
          grid reflows; nothing is left holding a space for an answer that is not
          coming.
        */}
        {account.product && <Detail label={t('accounts.productLabel')} value={account.product} />}
        <Detail label={t('accounts.openedLabel')} value={formatDate(account.createdAt)} />
      </dl>

      {/*
        The card is not itself a link, and the button is not the only way in.

        Wrapping the whole card in an anchor would swallow the copy-login button
        inside it — a nested interactive element is invalid, and in practice the
        copy press navigates instead of copying, which is the single action this
        card exists for. So the detail route gets its own control, and the card
        stays a card.
      */}
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href={`/accounts/${account.id}`}>{t('accounts.viewDetail')}</Link>
      </Button>

      {/*
        Funding is offered on LIVE, ACTIVE accounts only — the same pair the
        server's `/transferable` route narrows to. A transfer to a demo account
        would be a real-money loss with no counterparty, and one to a suspended
        account is refused after the client has already committed to it.

        It carries `?account=`, because the client has already told us WHICH
        account by pressing the button on it. Without that the transfer screen
        opened with nothing selected and made them find the same account again
        among every wallet and account they hold — the step this button exists to
        skip. The machinery was already there: `use-preselected-transfer.ts`
        seeds the account as the destination and the wallet in its currency as
        the source, and its comment says in as many words that it is for "the
        client clicked Transfer funds ON an account". Only the detail screen's
        menu was passing it.

        The id is not trusted from the URL at the other end — it is matched
        against the accounts the client actually holds, and ignored when no
        wallet in the matching currency exists. So a stale link degrades to the
        empty form rather than to a half-filled one that cannot be completed.
      */}
      {isLive && account.status === 'active' && (
        <Button asChild size="sm" className="w-full">
          <Link href={`/transfer?account=${account.id}`}>{t('accounts.fundAccount')}</Link>
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
