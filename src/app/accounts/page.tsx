'use client';

import { LineChart, Plus } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { t } from '@/lib/i18n';

/**
 * The client's MT5 accounts, live and demo.
 *
 * This screen rendered a fixed "No Active Trading Accounts" empty state for
 * everyone, unconditionally, with no request behind it — so a client who held
 * three live accounts was told they had none. That is the same failure as the
 * wallet showing a hardcoded $0.00 to someone holding $700, and it is the reason
 * this repo's hardest rule exists: a screen with no data must say so, never
 * render a plausible nothing.
 *
 * ## Why live and demo are separate sections rather than a filter
 *
 * A toggle shows one at a time, and the state that is not on screen is the one
 * that gets confused for the other. Both headed, both always present, with the
 * empty one saying "None yet" — a client can see at a glance that they have two
 * demo accounts and no live one, which is precisely the question this page is
 * opened to answer.
 *
 * Live is FIRST and stays first even when it is empty. Ordering by count would
 * put practice accounts above real money for a new client, and the top of the
 * list is where people stop reading.
 *
 * ## No balances
 *
 * Equity, margin and open positions live in MT5 and not in this database — see
 * `lib/api/trading.ts`. Rendering a balance here would mean inventing one, and a
 * number beside a real MT5 login that disagrees with the terminal is worse than
 * no number at all.
 */
export default function AccountsPage() {
  const accounts = useResource(['trading-accounts'], (signal) => tradingApi.listAccounts(signal));

  const all = accounts.data ?? [];
  const live = all.filter((a) => a.environment === 'live');
  const demo = all.filter((a) => a.environment === 'demo');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('accounts.subtitle')}</p>
        </div>
        {/*
          No handler, because there is no endpoint to open an account yet —
          provisioning runs through the MT5 bridge and the CRM has no route for
          it. Left as a live-looking button ONLY because removing it hides the
          fact that opening an account is a thing this product does; wire it to
          `POST /trading/accounts` the moment that exists, and until then this
          comment is the record that it does not.
        */}
        <Button type="button" disabled>
          <Plus className="h-4 w-4" />
          {t('accounts.openNew')}
        </Button>
      </div>

      <AsyncBoundary
        status={accounts.status}
        label={t('accounts.loading')}
        endpoints={['GET /trading/accounts']}
        onRetry={() => void accounts.refetch()}
        errorMessage={apiErrorMessage(accounts.error, t('accounts.loadFailed'))}
        error={accounts.error}
      >
        {all.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <LineChart className="mx-auto h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <h3 className="mt-4 text-sm font-semibold">{t('accounts.empty')}</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              {t('accounts.emptyBody')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <AccountSection
              heading={t('accounts.liveHeading')}
              note={t('accounts.liveNote')}
              accounts={live}
              environment="live"
            />
            <AccountSection
              heading={t('accounts.demoHeading')}
              note={t('accounts.demoNote')}
              accounts={demo}
              environment="demo"
            />
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

function AccountSection({
  heading,
  note,
  accounts,
  environment,
}: {
  heading: string;
  note: string;
  accounts: TradingAccount[];
  environment: 'live' | 'demo';
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold tracking-tight text-foreground">{heading}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          {t('accounts.noneOfKind')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} environment={environment} />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountCard({
  account,
  environment,
}: {
  account: TradingAccount;
  environment: 'live' | 'demo';
}) {
  const isLive = environment === 'live';

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('accounts.loginLabel')}
          </p>
          {/*
            `tabular` so a column of logins lines up digit for digit. These are
            compared against the terminal by eye, and proportional digits make
            two similar logins look identical at a glance.
          */}
          <p className="tabular truncate text-lg font-bold text-foreground">{account.mt5Login}</p>
        </div>
        {/*
          The one thing on this card that must never be misread. Live is the
          product's primary colour and demo is deliberately muted rather than a
          second bright colour — two competing badges read as two equal kinds of
          account, and only one of them can lose real money.
        */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            isLive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {isLive ? t('accounts.liveTag') : t('accounts.demoTag')}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        <Row label={t('accounts.tierLabel')} value={account.tier} />
        <Row label={t('accounts.groupLabel')} value={account.mt5Group} />
        <Row
          label={t('accounts.leverageLabel')}
          value={
            account.leverage === null
              ? null
              : t('accounts.leverageValue', { ratio: String(account.leverage) })
          }
        />
        <Row label={t('accounts.openedLabel')} value={formatOpened(account.createdAt)} />
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      {/*
        An em dash where the CRM holds nothing, rather than an omitted row.
        A card whose fields come and go by account is a card you have to read
        rather than scan, and "we do not have this" is itself information.
      */}
      <dd
        className={`truncate font-semibold ${value ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {value ?? t('accounts.unknownValue')}
      </dd>
    </div>
  );
}

/**
 * The opening date, in the reader's own locale.
 *
 * `undefined` as the locale rather than a hardcoded one, so a client in Dubai
 * and a client in Berlin each see the order they expect — this app already
 * carries an RTL Arabic requirement, and a hardcoded 'en-US' here would be one
 * more thing to find later.
 *
 * Returns null rather than throwing on an unparseable value: a malformed
 * timestamp should cost one dash on one card, not the whole page.
 */
function formatOpened(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
