'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SummaryRow } from '@/components/money/money-shell';
import { useResource } from '@/hooks/use-resource';
import { useMoneyRefresh } from '@/hooks/use-money-refresh';
import {
  depositsApi,
  type DepositRequest,
  type DepositState,
  type PaymentMethod,
} from '@/lib/api/deposits';
import { apiErrorMessage } from '@/lib/api/errors';
import { compareMoney } from '@/lib/money';
import { moneyText } from '@/lib/bidi';
import { keys } from '@/lib/query-keys';
import { localized, t } from '@/lib/i18n';

/** How often the card asks OUR API (never the provider) whether it has settled. */
const POLL_MS = 8_000;

/**
 * THE WAITING CARD — a hosted deposit whose provider sends nobody back
 * (backend 0173/0174: 3pay takes no return URL).
 *
 * A same-tab redirect would strand the client on 3pay's checkout with no way
 * home, and a deposit they paid for would look unfinished for ever. So the
 * client STAYS here: the checkout opens in a new tab from a real click (no
 * popup blocker), and this card shows what to send, on which network, how
 * long the page stays open, and the deposit's live state.
 *
 * The state is polled from OUR records (`GET …/status`), which 3pay's webhook
 * and the reconciler keep current — never from 3pay on each tick, whose
 * 60-a-minute budget every waiting client shares. "I have paid — check now"
 * asks 3pay once, on purpose.
 *
 * The network line is the one that prevents lost money: USDT sent on the wrong
 * chain never arrives. It is said here, before the client pays, in words.
 */
export function DepositWaiting({
  deposit,
  method,
  onReset,
}: {
  deposit: DepositRequest;
  method: PaymentMethod;
  onReset: () => void;
}) {
  const refreshMoney = useMoneyRefresh();
  // What "I have paid — check now" learned; a later poll that is FINAL wins.
  const [checked, setChecked] = React.useState<DepositState | null>(null);

  // Polling stops once either source says it is over: the last poll (read from
  // the cache, so no state is copied in an effect) or the client's own check.
  const queryClient = useQueryClient();
  const last = queryClient.getQueryData<DepositState>(keys.depositStatus.one(deposit.reference));
  const status = useResource(
    keys.depositStatus.one(deposit.reference),
    (signal) => depositsApi.status(deposit.reference, signal),
    {
      refetchInterval: isFinal(checked?.state) || isFinal(last?.state) ? undefined : POLL_MS,
      retry: 0,
    },
  );
  // The newest word wins, a FINAL one over any other: the poll or the check.
  const latest = isFinal(status.data?.state) ? status.data : (checked ?? status.data);
  const state = latest?.state ?? 'pending';
  const final = isFinal(state);
  // The balance moved: refetch it (never patched — §6.1), once, on arrival.
  React.useEffect(() => {
    if (state === 'success') void refreshMoney();
  }, [state, refreshMoney]);

  const [checking, setChecking] = React.useState(false);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const checkNow = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await depositsApi.settle(deposit.reference, undefined);
      setChecked(result);
    } catch (error) {
      setCheckError(apiErrorMessage(error, t('deposit.waitingCheckFailed')));
    } finally {
      setChecking(false);
    }
  };

  const remaining = useCountdown(deposit.paymentExpiresAt);

  return (
    <div className="space-y-4 p-5 sm:p-6">
      <div className="text-center">
        <h2 className="text-lg font-bold">
          {state === 'success'
            ? t('deposit.waitingDoneTitle')
            : final
              ? t('deposit.waitingFailedTitle')
              : latest?.underReview
                ? t('deposit.reviewTitle')
                : t('deposit.waitingTitle')}
        </h2>
        {!final && (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('deposit.waitingBody')}
          </p>
        )}
      </div>

      <dl className="mx-auto max-w-sm divide-y divide-border">
        <SummaryRow
          label={t('deposit.amountLabel')}
          value={moneyText(deposit.amount, deposit.currency)}
          strong
        />
        <SummaryRow
          label={t('deposit.methodTitle')}
          value={localized(method.name, method.nameAr)}
        />
        <SummaryRow label={t('deposit.referenceLabel')} value={deposit.reference} />
      </dl>

      {deposit.payWith && !final && (
        <div className="mx-auto max-w-sm space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('deposit.waitingNetwork', { asset: deposit.payWith })}
          </p>
          <p>{t('deposit.waitingPar', { currency: deposit.currency })}</p>
        </div>
      )}

      <StatusLine outcome={latest} currency={deposit.currency} />

      {!final && !latest?.underReview && deposit.paymentUrl && (
        <>
          {/* A real anchor, opened in a new tab by the client's own click. */}
          <Button asChild size="lg" className="w-full">
            <a href={deposit.paymentUrl} target="_blank" rel="noopener noreferrer">
              {t('deposit.openPaymentPage')}
              <ExternalLink className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </Button>
          {remaining !== null && (
            <p className="text-center text-[11px] text-muted-foreground" aria-live="polite">
              {remaining > 0
                ? t('deposit.waitingExpiresIn', { time: clock(remaining) })
                : t('deposit.waitingExpired')}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void checkNow()}
            disabled={checking}
          >
            {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('deposit.waitingCheckNow')}
          </Button>
          {checkError && (
            <p role="alert" className="text-center text-[11px] text-destructive">
              {checkError}
            </p>
          )}
        </>
      )}

      {final && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReset} className="flex-1 basis-0">
            {t('deposit.newRequest')}
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1 basis-0">
            <Link href={state === 'success' ? '/wallet' : '/deposit?tab=history'}>
              {state === 'success' ? t('deposit.waitingViewWallet') : t('deposit.trackIt')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusLine({
  outcome,
  currency,
}: {
  outcome: DepositState | null | undefined;
  currency: string;
}) {
  const state = outcome?.state ?? 'pending';
  if (state === 'success' && outcome) {
    const differs =
      outcome.requestedAmount !== null &&
      compareMoney(outcome.requestedAmount, outcome.amount) !== 0;
    return (
      <div role="status" className="space-y-1 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {t('deposit.waitingReceived', {
            amount: moneyText(outcome.amount, outcome.currency),
            currency,
          })}
        </p>
        {differs && outcome.requestedAmount && (
          <p className="text-[11px] text-muted-foreground">
            {t('deposit.waitingDifferent', {
              requested: moneyText(outcome.requestedAmount, outcome.currency),
            })}
          </p>
        )}
      </div>
    );
  }
  if (state === 'failure' || state === 'rejected') {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 text-sm font-semibold text-destructive"
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        {t('deposit.waitingFailed')}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {outcome?.underReview ? t('deposit.reviewBody') : t('deposit.waitingPending')}
    </p>
  );
}

function isFinal(state: string | null | undefined): state is string {
  return state === 'success' || state === 'failure' || state === 'rejected';
}

/** Seconds until `iso`, ticking each second; null when there is no expiry. */
function useCountdown(iso: string | null | undefined): number | null {
  const target = iso ? Date.parse(iso) : Number.NaN;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (Number.isNaN(target)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.floor((target - now) / 1000));
}

/** 29:41 */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
