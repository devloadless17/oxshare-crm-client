'use client';

import * as React from 'react';
import Link from 'next/link';
import { LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Dashboard } from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The dashboard's shared shell, plus the panel that reads trading data.
 *
 * Split out of `dashboard-body.tsx` because that file crossed the 340-line lint
 * ceiling. The seam is deliberate rather than arbitrary: everything here is
 * about TRADING (accounts) or is a layout primitive the whole
 * dashboard shares, while what stays behind is money (wallets, transactions).
 */

/** A titled card with an optional "see everything" link in its header. */
export function Panel({
  heading,
  icon: Icon,
  action,
  className,
  children,
}: {
  heading: string;
  icon: React.ElementType;
  action?: { href: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      /*
       * `shrink-0` is LOAD-BEARING, not spacing.
       *
       * A Panel is a flex child of a column that fills the viewport, and a flex
       * item's default is `flex-shrink: 1` — so once the stack is taller than
       * the space, the browser shrinks the items rather than overflowing. With
       * `overflow-hidden` here that does not clip a little off the bottom: the
       * panel collapses to its border and reads as a horizontal LINE.
       *
       * That is exactly what happened when the page root gained the fill chain.
       * Before it, the column was content-height and nothing ever had to
       * shrink; after it, the two panels below the fold became two lines.
       *
       * Refusing to shrink is what makes the page scroll instead — `<main>` is
       * the `overflow-y-auto` element and always was.
       */
      className={`shrink-0 overflow-hidden rounded-2xl border border-border bg-card ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-link" aria-hidden="true" />
          <h2 className="text-sm font-bold">{heading}</h2>
        </div>
        {action && (
          <Button asChild variant="ghost" size="sm">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/** "Nothing here", inside a panel that keeps its own frame and header. */
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      </div>
      {/* `tabular-nums` so a refresh does not shift the digits sideways. */}
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Trading accounts, as compact rows.
 *
 * The full live/demo card layout belongs on `/accounts`; repeating it here would
 * make the dashboard a second accounts page rather than a summary of one.
 *
 * The note about what `balance` is — and is not — is rendered once beneath the
 * list rather than on every row. The CRM holds that figure because there is no
 * MT5 bridge, and a number labelled only "balance" on a trading screen gets read
 * as equity, which differs by every open position.
 */
export function AccountsPanel({ accounts }: { accounts: Dashboard['tradingAccounts'] }) {
  return (
    <>
      <Panel
        heading={t('dashboard.accountsHeading')}
        icon={LineChart}
        action={{ href: '/accounts', label: t('dashboard.viewAllAccounts') }}
      >
        {accounts.length === 0 ? (
          <Empty title={t('dashboard.accountsEmpty')} body={t('dashboard.accountsEmptyBody')} />
        ) : (
          <ul className="divide-y divide-border">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                      account.environment === 'live'
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    {account.environment === 'live' ? t('accounts.liveTag') : t('accounts.demoTag')}
                  </span>
                  {/* Nullable until a bridge assigns one — "Being issued" is the
                      honest label, where an em dash would read as missing data
                      rather than pending. */}
                  <span className="font-mono text-sm font-semibold">
                    {account.login ?? t('accounts.loginPending')}
                  </span>
                </div>
                <p className="font-mono text-sm font-bold tabular-nums">
                  {formatMoney(account.balance, account.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
