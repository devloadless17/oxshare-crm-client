'use client';

import Decimal from 'decimal.js';
import { HAIRLINE_GRID, Stat, Surface } from '@/components/partner/partner-ui';
import type { Statement, StatementLine } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
import { describeLine, shortReference } from '@/lib/statement';
import { formatDay } from '@/components/transactions/statement-export';
import { t } from '@/lib/i18n';

/**
 * The statement itself: four figures that reconcile, then every line.
 *
 * `flex-1` down the chain so the lines' panel reaches the bottom of the screen
 * however few lines there are — a statement for a quiet month is a short list
 * in a full-height document, not a card stopping halfway down.
 *
 * Two renderings of the lines. From `md`, the six-column ledger table a
 * statement is expected to be. Below it, the same six facts as a two-line row
 * — what and when on the left, the signed amount and the balance it left on
 * the right — because six columns on a phone is a table that scrolls sideways,
 * and the balance column is exactly the one that ends up off-screen.
 */
export function StatementBody({
  statement,
  walletName,
  dimmed,
}: {
  statement: Statement;
  walletName: string;
  dimmed: boolean;
}) {
  const money = (value: string) => formatMoney(value, statement.currency);
  const period = `${formatDay(statement.from)} – ${formatDay(statement.to)}`;
  const credits = statement.lines.filter((l) => !new Decimal(l.amount).isNegative()).length;

  return (
    <div className={`flex flex-1 flex-col gap-4 transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      <div className={`${HAIRLINE_GRID} grid-cols-2 lg:grid-cols-4`}>
        <Stat
          label={t('statement.openingBalance')}
          value={money(statement.openingBalance)}
          hint={formatDay(statement.from)}
        />
        <Stat
          label={t('statement.moneyIn')}
          value={money(statement.totalCredits)}
          hint={t('statement.lineCount', { count: credits })}
        />
        <Stat
          label={t('statement.moneyOut')}
          value={money(statement.totalDebits)}
          hint={t('statement.lineCount', { count: statement.lines.length - credits })}
        />
        <Stat
          label={t('statement.closingBalance')}
          value={money(statement.closingBalance)}
          hint={formatDay(statement.to)}
          large
        />
      </div>

      {statement.truncated && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          {t('statement.truncated', { count: statement.lines.length })}
        </p>
      )}

      <Surface className="flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight">{walletName}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{period}</span>
        </div>

        {/* ── From md: the ledger table ── */}
        <div className="hidden flex-1 md:flex">
          <table className="h-full w-full text-sm">
            <caption className="sr-only">
              {t('statement.title')} {walletName} {period}
            </caption>
            <thead>
              <tr className="border-b border-border text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                <th className="px-5 py-2.5 text-start font-medium">{t('transactions.colDate')}</th>
                <th className="px-3 py-2.5 text-start font-medium">
                  {t('statement.colDescription')}
                </th>
                <th className="px-3 py-2.5 text-start font-medium">
                  {t('statement.colReference')}
                </th>
                <th className="px-3 py-2.5 text-end font-medium">{t('statement.moneyIn')}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t('statement.moneyOut')}</th>
                <th className="px-5 py-2.5 text-end font-medium">{t('statement.colBalance')}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <BalanceRow
                label={t('statement.openingBalance')}
                date={formatDay(statement.from)}
                value={money(statement.openingBalance)}
              />
              {statement.lines.length === 0 ? (
                <tr>
                  {/* `h-full` takes the table's spare height, so the closing
                      row sits at the bottom of the panel, not under this one. */}
                  <td
                    colSpan={6}
                    className="h-full px-5 py-10 text-center text-xs text-muted-foreground"
                  >
                    {t('statement.noMovements')}
                  </td>
                </tr>
              ) : (
                statement.lines.map((line) => <LineRow key={line.id} line={line} money={money} />)
              )}
              {statement.lines.length > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={6} className="h-full p-0" />
                </tr>
              )}
              <BalanceRow
                label={t('statement.closingBalance')}
                date={formatDay(statement.to)}
                value={money(statement.closingBalance)}
              />
            </tbody>
          </table>
        </div>

        {/* ── Below md: one two-line row per movement ── */}
        <div className="flex flex-1 flex-col md:hidden">
          <MobileBalance
            label={t('statement.openingBalance')}
            date={formatDay(statement.from)}
            value={money(statement.openingBalance)}
          />
          {statement.lines.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-5 py-10 text-center text-xs text-muted-foreground">
              {t('statement.noMovements')}
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-border/60">
              {statement.lines.map((line) => {
                const amount = new Decimal(line.amount);
                const credit = !amount.isNegative();
                return (
                  <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{describeLine(line)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(line.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}{' '}
                        · <span className="font-mono">{shortReference(line.referenceId)}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-end tabular-nums">
                      <p className={`text-sm font-semibold ${credit ? 'text-success' : ''}`}>
                        {credit ? '+' : '−'}
                        {money(amount.abs().toFixed(8))}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {money(line.balanceAfter)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <MobileBalance
            label={t('statement.closingBalance')}
            date={formatDay(statement.to)}
            value={money(statement.closingBalance)}
          />
        </div>
      </Surface>
    </div>
  );
}

function LineRow({ line, money }: { line: StatementLine; money: (value: string) => string }) {
  const amount = new Decimal(line.amount);
  const credit = !amount.isNegative();
  const at = new Date(line.createdAt);
  return (
    <tr className="h-px border-b border-border/60">
      <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
        {at.toLocaleDateString()}{' '}
        <span className="text-xs">
          {at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </td>
      <td className="px-3 py-2.5">{describeLine(line)}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
        {shortReference(line.referenceId)}
      </td>
      <td className="px-3 py-2.5 text-end whitespace-nowrap text-success">
        {credit ? money(amount.toFixed(8)) : ''}
      </td>
      <td className="px-3 py-2.5 text-end whitespace-nowrap">
        {credit ? '' : money(amount.abs().toFixed(8))}
      </td>
      <td className="px-5 py-2.5 text-end font-medium whitespace-nowrap">
        {money(line.balanceAfter)}
      </td>
    </tr>
  );
}

function BalanceRow({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <tr className="h-px border-y border-border bg-muted/40 font-semibold">
      <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">{date}</td>
      <td className="px-3 py-2.5" colSpan={4}>
        {label}
      </td>
      <td className="px-5 py-2.5 text-end whitespace-nowrap">{value}</td>
    </tr>
  );
}

function MobileBalance({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-y border-border bg-muted/40 px-4 py-3 first:border-t-0 last:border-b-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
