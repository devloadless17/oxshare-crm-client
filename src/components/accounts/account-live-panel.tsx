'use client';

import * as React from 'react';
import Link from 'next/link';
import { CloudOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loader';
import type { Resource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import type { AccountSnapshot, TradingAccount } from '@/lib/api/trading';
import { formatDecimal, formatMoney } from '@/lib/money';
import { moneySign } from '@/lib/account-stats';
import { t } from '@/lib/i18n';

/**
 * What MT5 holds on this account right now.
 *
 * ## Three outcomes, three different sentences
 *
 * This panel is the reason the API distinguishes them, so it must not collapse
 * them back together:
 *
 *  - **Figures.** MT5 answered. Balance, equity, floating, margin.
 *  - **No login** (`data === null`). The account was never provisioned on the
 *    trading server. PERMANENT until an operator issues a login, and about this
 *    account.
 *  - **Unreachable** (an error). The bridge could not be read. TEMPORARY, and
 *    about the platform rather than the client.
 *
 * Rendering the last two as one "unavailable" message tells a client whose
 * account is fine that their broker is down, and a client whose account was
 * never opened that it is a passing glitch. Both then wait for the wrong thing.
 *
 * ## The CRM balance stays on screen in every branch
 *
 * It is not a fallback for the live figure — it is a different number with its
 * own meaning: what this system has credited, which is what a transfer moved.
 * Both are labelled. The one thing this panel must never do is show an
 * unlabelled balance, because two money figures that disagree and neither says
 * why is the failure the wallet's `$0.00` bug was a version of.
 */
export function AccountLivePanel({
  account,
  snapshot,
}: {
  account: TradingAccount;
  snapshot: Resource<AccountSnapshot | null>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('accounts.liveFiguresTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('accounts.liveFiguresNote')}</p>
      </header>

      <div className="mt-4">
        {snapshot.status === 'loading' ? (
          <div className="flex min-h-[8rem] items-center justify-center">
            <PageLoader label={t('accounts.detailLoading')} srOnly />
          </div>
        ) : snapshot.status === 'ready' && snapshot.data ? (
          <LiveFigures snapshot={snapshot.data} />
        ) : snapshot.status === 'ready' ? (
          <Notice
            title={t('accounts.liveNoLogin')}
            body={t('accounts.liveNoLoginBody')}
            icon={<Info className="h-5 w-5" aria-hidden="true" />}
          />
        ) : (
          /*
           * Everything that is not "answered" lands here — error, forbidden and
           * the 404 `useResource` calls `unavailable`. They share a sentence on
           * purpose: from the client's side each one means the trading server
           * could not be read just now, and the distinction between them is for
           * the operator reading the request id, which `apiErrorMessage`
           * surfaces when the server sent one.
           */
          <Notice
            title={t('accounts.liveUnavailable')}
            body={apiErrorMessage(snapshot.error, t('accounts.liveUnavailableBody'))}
            icon={<CloudOff className="h-5 w-5" aria-hidden="true" />}
          />
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CrmBalance account={account} />
        <Positions />
      </div>
    </section>
  );
}

/**
 * The figures themselves.
 *
 * Currency comes from the SNAPSHOT rather than from the account row: MT5 is the
 * authority on what these amounts are denominated in, and if the two ever
 * disagree the label must match the number it sits under.
 */
function LiveFigures({ snapshot }: { snapshot: AccountSnapshot }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Figure
        label={t('accounts.equityLabel')}
        value={formatMoney(snapshot.equity, snapshot.currency)}
        hint={t('accounts.equityHint')}
        emphasis
      />
      <Figure
        label={t('accounts.mt5BalanceLabel')}
        value={formatMoney(snapshot.balance, snapshot.currency)}
        hint={t('accounts.mt5BalanceHint')}
      />
      <SignedFigure
        label={t('accounts.floatingLabel')}
        amount={snapshot.floating}
        currency={snapshot.currency}
        hint={t('accounts.floatingHint')}
      />
      <Figure
        label={t('accounts.marginLabel')}
        value={formatMoney(snapshot.margin, snapshot.currency)}
      />
      <Figure
        label={t('accounts.freeMarginLabel')}
        value={formatMoney(snapshot.marginFree, snapshot.currency)}
      />
      <Figure
        label={t('accounts.marginLevelLabel')}
        /*
         * Null means the account has no margin requirement AT ALL — no open
         * positions — which is a different answer from a level of zero. The API
         * declines to default it for that reason, so this must not render it as
         * `0%`: a margin level near zero is a margin call, and the account with
         * nothing open is the safest state there is.
         *
         * `formatDecimal`, not `formatMoney`: a margin level is a percentage,
         * not an amount, and a currency symbol in front of it would be wrong.
         */
        value={
          snapshot.marginLevel === null
            ? t('accounts.marginLevelNone')
            : `${formatDecimal(snapshot.marginLevel)}%`
        }
        muted={snapshot.marginLevel === null}
      />
    </dl>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 font-bold tabular-nums ${emphasis ? 'text-2xl' : 'text-lg'} ${
          muted ? 'text-sm font-medium text-muted-foreground' : ''
        }`}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A figure that can be negative, coloured by which way it points.
 *
 * The sign comes from `moneySign` — decimal.js — and NOT from the formatted
 * string. Reading it back off the rendered text (`value.startsWith('-')`) breaks
 * on the currency symbol, on grouping, and on any locale that brackets negatives
 * instead of signing them, and it breaks by rendering a loss in profit green.
 *
 * Colour is not the only cue: the sign character carries the same information
 * for anybody who cannot distinguish the two, and `formatMoney` already emits
 * the minus. A leading `+` is added on gains so the two read as a pair.
 */
function SignedFigure({
  label,
  amount,
  currency,
  hint,
}: {
  label: string;
  amount: string;
  currency: string;
  hint?: string;
}) {
  const sign = moneySign(amount);
  const formatted = formatMoney(amount, currency);

  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-lg font-bold tabular-nums ${
          sign === 'positive' ? 'text-success' : sign === 'negative' ? 'text-destructive' : ''
        }`}
      >
        {sign === 'positive' ? `+${formatted}` : formatted}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Notice({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
      {icon}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-xs">{body}</p>
    </div>
  );
}

/**
 * The CRM's own figure, labelled as what it is.
 *
 * Present in every branch of the panel. When MT5 cannot be read this is the only
 * balance left, and it is a real number rather than a fallback — it is what a
 * transfer credited to this account.
 */
function CrmBalance({ account }: { account: TradingAccount }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {t('accounts.crmBalanceLabel')}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">
        {formatMoney(account.balance, account.currency)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('accounts.crmBalanceHint')}</p>
    </div>
  );
}

/**
 * Why there is no list of open trades, said carefully.
 *
 * The copy states that individual positions are not CARRIED here and points at
 * the terminal — it never says "you have no open positions", which would be
 * false for a client holding three and reading this page. The same rule the
 * dashboard's positions panel follows, and for the same reason: a boundary is
 * readable, a wrong statement about someone's own trades is not.
 *
 * The account TOTALS above do include open trades, through equity and floating,
 * so this is a statement about granularity rather than about missing data. That
 * is worth the sentence: a client who can see their floating P/L will otherwise
 * reasonably assume the positions behind it are here somewhere.
 */
function Positions() {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {t('accounts.positionsTitle')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('accounts.positionsBody')}</p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link href="/platforms">{t('accounts.openTerminal')}</Link>
      </Button>
    </div>
  );
}
