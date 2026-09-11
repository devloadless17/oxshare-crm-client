'use client';

import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { tradingApi, type BalanceMovement } from '@/lib/api/trading';
import { keys } from '@/lib/query-keys';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * MONEY THE BROKER MOVED DIRECTLY ON AN MT5 ACCOUNT.
 *
 * ## Why this is a section of its own and not a row in the table above
 *
 * These are a different KIND of record from everything else on this screen. A
 * transaction is a deposit or withdrawal against the WALLET; a transfer moves
 * money between the wallet and an account; one of these has **no wallet leg and
 * no ledger entry at all** — it happened on MT5 and the CRM only observes it.
 *
 * Mixing them into the transactions table would put three different meanings of
 * "my money moved" in one list, and the one that does NOT change the wallet
 * balance is the one a client would misread. Somebody seeing a +250 inline
 * would go looking for 250 in their wallet and find nothing. So: its own
 * heading, its own note saying outright that the wallet is untouched.
 *
 * ## Why it exists at all
 *
 * An admin can credit — or DEBIT — a client's trading account through the
 * console. That movement is deliberately one-sided, so it appears in neither of
 * the two lists above, and until now it appeared nowhere the client could look.
 * A debit in particular had no client-visible record anywhere in the CRM.
 *
 * ## The sign is load-bearing
 *
 * `amount` arrives SIGNED — negative is money leaving the account — and is
 * rendered through `formatMoney`, which is decimal.js all the way down. A
 * figure shown without its sign would report a debit as a credit, which is this
 * whole section failing while appearing to work.
 */
export function Mt5Adjustments({ currency }: { currency: string }) {
  const movements = useResource(keys.transactions.balanceMovements(), (signal) =>
    tradingApi.getBalanceMovements(signal),
  );

  const items = movements.data?.items ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-live="polite">
      <h2 className="text-sm font-semibold text-foreground">{t('transactions.mt5Title')}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('transactions.mt5Note')}</p>

      <div className="mt-3">
        <AsyncBoundary
          status={movements.status}
          label={t('transactions.mt5Loading')}
          endpoints={['GET /trading/balance-movements']}
          onRetry={() => void movements.refetch()}
          errorMessage={t('transactions.mt5LoadFailed')}
          error={movements.error}
        >
          {items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('transactions.mt5Empty')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((movement) => (
                <AdjustmentRow key={movement.ticket} movement={movement} currency={currency} />
              ))}
            </ul>
          )}

          {/*
            A capped list SAYS it is capped. This product has shipped the other
            thing twice — a partner client count that was the length of what
            fitted, and a referred list cut at fifty in silence — and a list that
            is cut without saying so is a number the reader will trust.
          */}
          {movements.data?.truncated === true && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('transactions.mt5Truncated')}
            </p>
          )}
        </AsyncBoundary>
      </div>
    </section>
  );
}

function AdjustmentRow({ movement, currency }: { movement: BalanceMovement; currency: string }) {
  /*
   * The sign decides the colour, and it is read from the VALUE rather than from
   * the action label: MT5's action codes are a vocabulary that can grow, and a
   * label this screen does not recognise would otherwise render as neither.
   * A leading '-' is a fact about the amount.
   */
  const isDebit = movement.amount.trim().startsWith('-');

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{movement.actionLabel}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t('transactions.mt5Account')} {movement.login}
          {' · '}
          {new Date(movement.dealtAt).toLocaleString()}
        </p>
        {/* The dealer's reason — the only explanation a client gets for a
            movement they did not initiate, so it is shown whenever present. */}
        {movement.comment && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {t('transactions.mt5Reason')}: {movement.comment}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          isDebit ? 'text-destructive' : 'text-success'
        }`}
      >
        {formatMoney(movement.amount, currency)}
      </span>
    </li>
  );
}
