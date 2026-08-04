'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { paymentsApi } from '@/lib/api/payments';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

/**
 * Request a withdrawal — CORE-07.
 *
 * ── What this screen does NOT do, deliberately ──────────────────────────────
 *
 * It does not decide anything about the money. The amount is a decimal STRING
 * from the input straight into the request body: no parsing, no comparison
 * against the balance, no client-side minimum. `Number()` and `parseFloat` are
 * lint errors on this path (§6.1), and that is not merely about precision —
 * R-5.1 is explicit that the server re-derives every constraint from its own
 * state, because the request supplies an intent and the server supplies every
 * fact. A client-side check here would be a second source of truth for
 * "can this be withdrawn", and the two would drift.
 *
 * So the available balance below is shown for the human, and is not a gate.
 * The server enforces KYC level 1, the available balance, and the configured
 * minimum and maximum, and answers 422 with a message this screen displays.
 *
 * ── What it is honest about ─────────────────────────────────────────────────
 *
 * CORE-08 requires an email OTP on every withdrawal and it is NOT built — it
 * needs Redis for the single-use 5-minute TTL (§8.4, "never in Postgres"), which
 * arrives with the queues milestone. Until then the only control between a
 * request and a payout is admin review, and the copy says so rather than
 * implying a confirmation step that does not exist.
 */

function WithdrawForm({ wallets, onDone }: { wallets: Wallet[]; onDone: () => void }) {
  const fundable = wallets.filter((w) => !isZeroMoney(w.available));
  // Typed off the generated schema, so the select can only ever hold a currency
  // the API actually accepts.
  type Currency = Wallet['currency'];
  const [currency, setCurrency] = React.useState<Currency>(fundable[0]?.currency ?? 'USD');
  const [amount, setAmount] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

  const selected = wallets.find((w) => w.currency === currency);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Presence only. Whether the amount is valid, affordable or above the
    // minimum is the server's question — see the note at the top of this file.
    if (!amount.trim()) return setError(t('withdraw.needAmount'));
    if (!destination.trim()) return setError(t('withdraw.needDestination'));

    setSubmitting(true);
    try {
      await paymentsApi.requestWithdrawal({
        amount: amount.trim(),
        currency,
        destination: destination.trim(),
        // Derived from the currency rather than chosen by the client: a USDT
        // balance cannot be paid out through the fiat rail, and offering that
        // choice would invite a request the server must then refuse.
        provider: currency === 'USDT' ? 'usdt' : 'whish',
      });
      onDone();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('withdraw.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (fundable.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {t('withdraw.noWallets')}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-5 rounded-2xl border border-border bg-card p-6"
    >
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="withdraw-currency">{t('withdraw.currency')}</Label>
        <select
          id="withdraw-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {fundable.map((w) => (
            <option key={w.currency} value={w.currency}>
              {w.currency}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="withdraw-amount">{t('withdraw.amount')}</Label>
        <Input
          id="withdraw-amount"
          // `inputMode` rather than type="number": a number input hands back a
          // coerced value in some browsers, and §6.1 says money stays a string
          // from the keystroke to the request body.
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('withdraw.amountPlaceholder')}
        />
        {selected && (
          <p className="text-[11px] text-muted-foreground">
            {t('withdraw.available', {
              amount: formatMoney(selected.available, selected.currency),
            })}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="withdraw-destination">{t('withdraw.destination')}</Label>
        <Input
          id="withdraw-destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={t('withdraw.destinationPlaceholder')}
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">{t('withdraw.destinationHint')}</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-[11px] text-info">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t('withdraw.reviewNote')}</span>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t('withdraw.submitting')}</span>
          </>
        ) : (
          <span>{t('withdraw.submit')}</span>
        )}
      </Button>
    </form>
  );
}

export default function WithdrawPage() {
  const [submitted, setSubmitted] = React.useState(false);
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('withdraw.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('withdraw.subtitle')}</p>
      </div>

      {submitted ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-success/30 bg-success/5 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <h2 className="text-base font-bold text-success">{t('withdraw.submittedTitle')}</h2>
          {/*
            Says the funds are HELD, not sent. The backend puts the amount on
            hold and writes no ledger entry until an admin settles it — telling
            the client "sent" would be a different, wrong story about their money.
          */}
          <p className="max-w-md text-xs text-muted-foreground">{t('withdraw.submittedBody')}</p>
          <Link
            href="/transactions"
            className="text-xs font-semibold text-link hover:underline focus-outline rounded-sm"
          >
            {t('withdraw.viewTransactions')}
          </Link>
        </div>
      ) : (
        <AsyncBoundary
          status={wallets.status}
          label={t('withdraw.loading')}
          endpoints={['GET /wallet', 'POST /payments/withdrawals']}
          onRetry={() => void wallets.refetch()}
          errorMessage={apiErrorMessage(wallets.error, t('withdraw.loadFailed'))}
        >
          <WithdrawForm wallets={wallets.data ?? []} onDone={() => setSubmitted(true)} />
        </AsyncBoundary>
      )}
    </div>
  );
}
