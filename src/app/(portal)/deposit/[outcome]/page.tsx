'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loader';
import { MoneySheet } from '@/components/money/money-shell';
import { depositsApi } from '@/lib/api/deposits';
import { t } from '@/lib/i18n';
import { useMoneyRefresh } from '@/hooks/use-money-refresh';

/**
 * Where a gateway sends the client back after they pay.
 *
 * ## THE URL IS NOT EVIDENCE
 *
 * This route is reached by a browser redirect the provider controls, and the
 * `outcome` segment is a value the client can edit in their address bar. So it
 * decides NOTHING about money: it is used only to pick which message to show
 * first while the real answer is fetched.
 *
 * `depositsApi.settle()` is what determines the outcome — it asks the server,
 * which asks the provider over an authenticated channel. A screen that trusted
 * `/deposit/success` would credit a wallet for anybody who typed it.
 *
 * ## Why the client settles at all, when a callback exists
 *
 * The provider's server-to-server callback is the primary path. This is the
 * second, and having two is deliberate: a callback can be delayed, lost, or
 * blocked by a firewall, and a client staring at a pending deposit they have
 * just paid for is the worst outcome this flow has. Settlement is idempotent, so
 * whichever arrives first wins and the other is a no-op.
 *
 * ## The three outcomes, and the one that needs care
 *
 * `success` and `failed` are settled. Anything else is NOT a failure — at Whish,
 * `pending` includes "the client tried and failed but the link is still
 * payable". So the middle state says "not confirmed yet" and explicitly tells
 * the client not to pay again, rather than reporting a failure that would send
 * them to pay a second time.
 */
export default function DepositOutcomePage() {
  const params = useParams<{ outcome: string }>();
  const search = useSearchParams();

  const reference = search.get('reference');
  /*
   * The method the deposit was filed under. The server now puts it in the
   * redirect it hands the provider, so this reads it rather than assuming.
   *
   * The `whish` fallback is kept for links already in flight — a client
   * mid-payment when this shipped comes back to a URL built by the old code —
   * and it is a fallback rather than the answer: it was previously the ONLY
   * value, and the day a second gateway is added, defaulting would settle its
   * payments against the wrong provider, find nothing, and leave a paid client
   * on "not confirmed yet".
   */
  const method = search.get('method') ?? 'whish';
  /** Only ever the FIRST impression. The server's answer replaces it. */
  const hinted = params?.outcome === 'failure' ? 'failure' : 'success';

  /*
   * A missing reference resolves in the INITIALISER, not in the effect.
   *
   * It is derivable from the URL at first render — there is nothing to wait
   * for — so setting it from an effect would be a second render pass to reach a
   * conclusion already available, which is exactly what
   * `react-hooks/set-state-in-effect` exists to catch.
   */
  const [state, setState] = React.useState<'checking' | 'success' | 'pending' | 'failure'>(() =>
    reference ? 'checking' : 'failure',
  );

  const refreshMoney = useMoneyRefresh();

  React.useEffect(() => {
    if (!reference) return;

    /*
     * Aborted on unmount so a client who navigates away mid-check does not
     * settle state on a component that is gone. The SERVER-side settlement is
     * unaffected — it has already happened by the time the response is
     * discarded, which is the point of doing it server-side.
     */
    const controller = new AbortController();

    depositsApi
      .settle(reference, method, controller.signal)
      .then((result) => {
        /*
         * REFRESH FIRST, on every settled outcome.
         *
         * This call is not a status check — it SETTLES, and a settlement
         * credits the wallet (see the note on `depositsApi.settle`). The
         * screen's next control is a link straight to /wallet, so without this
         * the client followed a "deposit confirmed" message to a balance that
         * had not moved. Reported.
         *
         * The socket cannot cover this one: the client has just come back from
         * the provider's redirect, so the realtime connection is still
         * handshaking while this runs, and Socket.IO has no replay for what it
         * missed. A screen that moves money refreshes it itself.
         *
         * Not gated on `success`: a 'rejected' outcome releases the pending
         * transaction, which changes the list just as a credit does. It is
         * deliberately NOT awaited — the state below is what this component
         * renders, and a slow refetch must not hold the answer back.
         */
        void refreshMoney();
        if (result.state === 'success') setState('success');
        else if (result.state === 'failure' || result.state === 'rejected') setState('failure');
        // Anything else is still in flight — including a failed ATTEMPT on a
        // link that remains payable. Not a failure, and not a success.
        else setState('pending');
      })
      .catch(() => {
        /*
         * The CHECK failed, which is not the same as the payment failing. Fall
         * back to "not confirmed yet" rather than to the hinted outcome: telling
         * a client who paid that their payment failed is the more expensive
         * mistake of the two, and the transactions screen shows the truth.
         */
        if (!controller.signal.aborted) setState(hinted === 'failure' ? 'failure' : 'pending');
      });

    return () => controller.abort();
  }, [reference, method, hinted, refreshMoney]);

  if (state === 'checking') {
    return (
      // Same fill as the settled render below, so the answer replacing the
      // spinner does not resize the page around it.
      <div className="flex w-full flex-1 flex-col">
        <PageLoader label={t('deposit.checking')} />
      </div>
    );
  }

  const view = {
    success: {
      icon: CheckCircle2,
      tone: 'bg-success/10 text-success',
      title: t('deposit.successTitle'),
      body: t('deposit.successBody'),
    },
    pending: {
      icon: Clock,
      tone: 'bg-info/10 text-info',
      title: t('deposit.pendingStillTitle'),
      body: t('deposit.pendingStillBody'),
    },
    failure: {
      icon: XCircle,
      tone: 'bg-destructive/10 text-destructive',
      title: reference ? t('deposit.failureTitle') : t('deposit.missingReference'),
      body: t('deposit.failureBody'),
    },
  }[state];

  const Icon = view.icon;

  return (
    /*
     * `flex-1` root, `flex-1` sheet, `flex-1` content: the outcome TAKES THE
     * FRAME rather than sitting as a short card over dead space — the same
     * treatment the partner status panels give a single-message screen. The
     * old `min-h-[40vh]` floor went with it; the frame is the height now.
     *
     * `shadow-none` is a per-screen override, not a MoneySheet change: the
     * deposit/withdraw/transfer forms keep their raised card, while a
     * full-height sheet with a drop shadow reads as a card that failed to fit.
     */
    <div className="flex w-full flex-1 flex-col">
      <MoneySheet className="flex flex-1 flex-col shadow-none">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className={`flex h-14 w-14 items-center justify-center rounded-full ${view.tone}`}>
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <div>
            {/* `role="status"` so the outcome is ANNOUNCED — this screen renders
                after an async check, so a screen-reader user would otherwise be
                left on the spinner's announcement. */}
            <h1 role="status" className="text-xl font-bold">
              {view.title}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {view.body}
            </p>
          </div>

          {/* Both actions the SAME size — the hierarchy is carried by the
              variant (filled vs outline), not by one button being smaller. */}
          <div className="flex w-full max-w-xs flex-col gap-2 pt-2">
            <Button asChild size="lg">
              <Link href="/wallet">{t('deposit.backToWallet')}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={state === 'failure' ? '/deposit' : '/deposit?tab=history'}>
                {state === 'failure' ? t('deposit.tryAgain') : t('deposit.trackIt')}
              </Link>
            </Button>
          </div>
        </div>
      </MoneySheet>
    </div>
  );
}
