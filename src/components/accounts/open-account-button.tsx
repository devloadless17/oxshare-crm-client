'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResource } from '@/hooks/use-resource';
import { OpenAccountDialog } from '@/components/accounts/open-account-dialog';
import {
  tradingApi,
  type SelfServiceAvailability,
  type TradingEnvironment,
} from '@/lib/api/trading';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Open a trading account of ONE environment.
 *
 * ## One button per tab, not one button offering a choice
 *
 * The first cut was a single button whose dialog asked live-or-demo. Once the
 * page became tabs that was wrong twice over: a client standing in the Demo tab
 * was asked again which kind they wanted, and could answer "live" from inside
 * it. The environment is the tab, so the button inherits it and the dialog asks
 * only what it does not already know.
 *
 * ## Availability is asked, not assumed
 *
 * `GET /trading/accounts/self-service` says which environments the broker has
 * switched on. A tab whose environment is off shows no button rather than one
 * that fails: offering something the API will refuse teaches a client that a
 * feature is not for them by making them press it.
 *
 * ## While that request is in flight, this says so
 *
 * It used to render NOTHING, on the reasoning that "a button that appears a
 * second late beats one that appears and then vanishes". The second half is
 * right and the first half is what a client actually experienced: the accounts
 * list resolves on its own request, so the page finished loading — heading,
 * tabs, cards, all settled — with a blank space where the only control on it
 * belongs. There is nothing on screen to say another request is still running,
 * so the honest reading of a finished page with no button is that opening an
 * account is not offered.
 *
 * A disabled button carrying a spinner fixes both halves at once: it reserves
 * the space, so nothing shifts when the answer lands, and it says the delay is
 * ours rather than a refusal. It cannot be pressed, so it cannot open a dialog
 * whose options have not arrived.
 *
 * The vanishing the old comment feared is real and is handled where it happens —
 * `explainWhenClosed` replaces the button with a sentence, and the cap replaces
 * it with the limit. Both are answers. Neither is a blank.
 */
export function OpenAccountButton({
  environment,
  explainWhenClosed = false,
  variant = 'default',
}: {
  environment: TradingEnvironment;
  /*
   * `held` was here — the count the page rendered, compared with one cap per
   * environment. The cap is each PRODUCT's now (backend 0201) and the offer
   * carries what the client holds under each, counted by the server with the
   * rule it refuses on (closed accounts excluded), so nothing is counted here.
   */
  /**
   * Say WHY when this environment is switched off, instead of rendering
   * nothing.
   *
   * Set on the empty state and not on the toolbar. An empty tab with no button
   * and no explanation reads as a broken page — the honest reading is "the
   * broker has not enabled this online yet", and the client cannot get there on
   * their own. In the toolbar, beside accounts they already hold, the same
   * sentence is standing noise.
   */
  explainWhenClosed?: boolean;
  variant?: 'default' | 'outline';
}) {
  const [open, setOpen] = React.useState(false);

  const availability = useResource<SelfServiceAvailability>(
    keys.tradingAccounts.selfService(),
    (signal) => tradingApi.getSelfServiceAvailability(signal),
  );

  const label = environment === 'live' ? t('accounts.openLive') : t('accounts.openDemo');

  /*
   * Still asking. The button is present, reserved and inert — see the note
   * above. `loading` disables it in the Button itself, so there is no state in
   * which this shows a spinner and still opens the dialog.
   */
  if (availability.status === 'loading') {
    return (
      <Button variant={variant} size="sm" loading>
        {label}
      </Button>
    );
  }

  /*
   * The request FAILED, which is not the same as the broker having switched
   * this off — and rendering nothing would say the second.
   *
   * A retry rather than a message, because the client can act on it and because
   * the alternative is a screen that quietly stops offering accounts until
   * somebody reloads. Same rule as `AsyncBoundary` applies to the list itself:
   * a failed request shows an error with a retry, never an empty success state.
   */
  if (availability.status === 'error') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void availability.refetch()}
        loading={availability.isFetching}
      >
        {/*
          The refresh mark while idle, the shared Spinner while in flight — and
          never a `RefreshCw` with `animate-spin` on it, which is the exact
          pattern `ui/loader.tsx` was written to remove. That version froze mid-
          rotation for anyone with reduce-motion on, because globals.css cuts
          every animation to 0.001ms and `animate-spin` obeys it.

          Hidden rather than spun, so the two marks never stack: `Button` puts
          its Spinner before the children, so leaving this in would show a
          spinner and an arrow side by side.
        */}
        {!availability.isFetching && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        {t('accounts.availabilityRetry')}
      </Button>
    );
  }

  /*
   * `unavailable` — a 404, meaning the endpoint is not built on this
   * deployment. Nothing to offer and nothing to retry, so nothing is rendered:
   * this is the one case where a blank is the honest answer.
   */
  const options = availability.data;
  if (!options) return null;

  /*
   * The door is shut for this environment — the broker has configured no
   * account types for it. Usually that is live accounts on a deployment whose
   * MT5 manager account has not been granted a real group yet.
   */
  if (!options[environment]) {
    if (!explainWhenClosed) return null;
    return (
      <p className="max-w-sm text-xs text-muted-foreground">
        {environment === 'live' ? t('accounts.liveClosed') : t('accounts.demoClosed')}
      </p>
    );
  }

  /*
   * At the cap, the button is REPLACED by the reason rather than removed or
   * disabled.
   *
   * Removed, a client at the limit finds the control gone and assumes a bug.
   * Disabled, they hover a dead button looking for a tooltip. One line answers
   * the question they are about to ask support. The cap is per PRODUCT (backend
   * 0201), so the door is shut only when EVERY product offered here is full —
   * otherwise the dialog offers the others and marks the full ones.
   */
  const types = environment === 'live' ? options.liveTypes : options.demoTypes;
  if (types.every((type) => type.heldAccounts >= type.maxAccounts)) {
    return <p className="text-xs text-muted-foreground">{t('accounts.capReached')}</p>;
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <OpenAccountDialog
          environment={environment}
          options={options}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
