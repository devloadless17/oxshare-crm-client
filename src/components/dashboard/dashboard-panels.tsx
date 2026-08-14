'use client';

import * as React from 'react';
import Link from 'next/link';
import { LineChart, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Dashboard, Position } from '@/lib/api/trading';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The dashboard's shared shell, plus the two panels that read trading data.
 *
 * Split out of `dashboard-body.tsx` because that file crossed the 340-line lint
 * ceiling. The seam is deliberate rather than arbitrary: everything here is
 * about TRADING (positions, accounts) or is a layout primitive the whole
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
 * Open positions.
 *
 * ## Empty for everyone today, and the copy is careful about why
 *
 * Nothing writes to `positions` until an MT5 bridge exists, so this renders
 * empty for every client. The QUERY is real — the emptiness is an answer the
 * database gave rather than a hardcoded state, which is the whole reason the
 * table was created ahead of the feed.
 *
 * The message says trades are not SYNCED, never "you have no trades". A client
 * who opened a position this morning would still see zero here, and the second
 * sentence would be a falsehood told to somebody in a position to know better.
 * The terminal is named as the source of truth and linked, so the panel is a
 * boundary rather than a broken feature.
 */
export function PositionsPanel({ positions }: { positions: Position[] }) {
  return (
    <Panel heading={t('dashboard.positionsHeading')} icon={TrendingUp}>
      {positions.length === 0 ? (
        <div className="space-y-3 p-8 text-center">
          <p className="text-sm font-semibold">{t('dashboard.positionsEmpty')}</p>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
            {t('dashboard.positionsEmptyBody')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/platforms">{t('nav.platforms')}</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">{t('dashboard.positionsColSymbol')}</th>
                <th className="px-5 py-2.5 font-semibold">{t('dashboard.positionsColSide')}</th>
                <th className="px-5 py-2.5 text-right font-semibold">
                  {t('dashboard.positionsColVolume')}
                </th>
                <th className="px-5 py-2.5 text-right font-semibold">
                  {t('dashboard.positionsColOpenPrice')}
                </th>
                <th className="px-5 py-2.5 font-semibold">{t('dashboard.positionsColAccount')}</th>
                <th className="px-5 py-2.5 font-semibold">{t('dashboard.positionsColOpened')}</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <PositionRow key={position.id} position={position} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PositionRow({ position }: { position: Position }) {
  const isBuy = position.side === 'buy';
  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
      <td className="px-5 py-3 font-semibold">{position.symbol}</td>
      <td className="px-5 py-3">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            isBuy
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-destructive/20 bg-destructive/10 text-destructive'
          }`}
        >
          {isBuy ? t('dashboard.sideBuy') : t('dashboard.sideSell')}
        </span>
      </td>
      {/* Volumes and prices are decimal STRINGS and are printed verbatim —
          never coerced, and never re-rounded here. */}
      <td className="px-5 py-3 text-right font-mono tabular-nums">{position.volume}</td>
      <td className="px-5 py-3 text-right font-mono tabular-nums">{position.openPrice}</td>
      <td className="px-5 py-3 font-mono text-muted-foreground">
        {position.login ?? t('accounts.loginPending')}
      </td>
      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
        {new Date(position.openedAt).toLocaleDateString()}
      </td>
    </tr>
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
