'use client';

import * as React from 'react';
import { CloudOff, Info } from 'lucide-react';
import { PageLoader } from '@/components/ui/loader';
import type { Resource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import type { AccountSnapshot } from '@/lib/api/trading';
import { formatDecimal, formatMoney, isZeroMoney } from '@/lib/money';
import { ltr } from '@/lib/bidi';
import { moneySign } from '@/lib/account-stats';
import { intlLocale, t } from '@/lib/i18n';

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
 * ## ONE balance on this screen, and it is MT5's
 *
 * The CRM's cached `trading_accounts.balance` was shown here beside the live
 * one, each labelled, and it is gone. Labelling two money figures that disagree
 * is better than not labelling them, but it still asks a client to hold two
 * balances in mind and decide which applies — and the cached one is only ever
 * the stale answer to "what do I have". MT5 is the authority, so it is the
 * figure.
 *
 * The cached column still exists and still matters; it is what a wallet
 * transfer credits, and the transfer screen is where that is worth saying.
 */
export function AccountLivePanel({ snapshot }: { snapshot: Resource<AccountSnapshot | null> }) {
  const readAt = snapshot.updatedAt ? new Date(snapshot.updatedAt) : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('accounts.liveFiguresTitle')}</h2>
        {/*
          WHEN these figures were read, in place of the Refresh button that used
          to sit on this screen.

          The button was doing two jobs — fetching, and reassuring somebody that
          the number was current. The poll took over the first; this is the
          second, and it is the more honest half: a timestamp says how old the
          figure actually is, where a button only ever said that pressing it
          would do something.

          From React Query via `updatedAt`, not a `useState` set in an effect —
          which is a lint error in this repo and would be a second source for a
          fact the fetch already knows. `0` means nothing has landed yet, so the
          undated note stands in until the first read.
        */}
        <p className="text-xs text-muted-foreground">
          {readAt
            ? t('accounts.liveFiguresReadAt', { time: readAt.toLocaleTimeString(intlLocale()) })
            : t('accounts.liveFiguresNote')}
        </p>
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
      {/*
        Credit is part of equity and is NOT part of balance or floating —
        `floating` is derived as `equity - balance - credit`. Without this tile
        the three figures above simply did not reconcile on any account
        carrying a bonus, and the client had nothing to explain the gap.
        Shown only when there is some: a permanent zero is noise.
      */}
      {snapshot.credit && !isZeroMoney(snapshot.credit) && (
        <Figure
          label={t('accounts.creditLabel')}
          value={formatMoney(snapshot.credit, snapshot.currency)}
          hint={t('accounts.creditHint')}
        />
      )}
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
        {ltr(sign === 'positive' ? `+${formatted}` : formatted)}
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
