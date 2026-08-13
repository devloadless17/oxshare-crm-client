'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { paymentsApi, type WithdrawalMethod } from '@/lib/api/payments';
import { newIdempotencyKey } from '@/lib/api/client';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { WithdrawalDestinationField } from '@/components/money/withdrawal-fields';
import {
  AmountField,
  AmountPresets,
  DestinationSelect,
  FormError,
  MethodTile,
  MoneyFooter,
  MoneyHeader,
  MoneySection,
  MoneySheet,
  StepRail,
} from '@/components/money/money-shell';
import { presetsWithin } from '@/components/money/amount-presets';
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
 * The server enforces KYC level 1, the available balance, the configured
 * minimum and maximum, and whether the chosen method is real and enabled — and
 * answers 422 with a message this screen displays.
 *
 * ── ONE step, and the code is gone from the SERVER too ──────────────────────
 *
 * This used to be two: state the withdrawal, then confirm it with a six-digit
 * code emailed to the account address and bound by HMAC to the exact amount,
 * currency, destination and rail. That control was removed at the operator's
 * request, and removed all the way down — the gate, `POST
 * /payments/withdrawals/otp`, the DTO field, the service and the email template
 * are all gone.
 *
 * It could not simply be switched off. The gate read
 * `security_settings.withdrawal_otp`, which DEFAULTS TO TRUE when no row exists
 * (deliberately — a fresh deployment fails safe), and the admin Security tab
 * that would have toggled it no longer exists. Any database whose seed had not
 * run therefore refused every withdrawal from this form with "A confirmation
 * code is required", correctable only by SQL.
 *
 * ── The rail decides what the form ASKS FOR ─────────────────────────────────
 *
 * The rails come from `withdrawal_payment_methods` — data, so the desk can add
 * one without a deploy — and `components/money/withdrawal-fields.tsx` decides
 * what each one collects. Whish takes a phone number through the country-code
 * input; a rail this build has not learned yet falls back to a text box labelled
 * with that rail's own name. There is no generic "Destination" field any more:
 * it named a database column rather than asking a question, and its placeholder
 * advertised an IBAN to clients paying out over Whish.
 */

function WithdrawForm({
  wallets,
  methods,
  onDone,
}: {
  wallets: Wallet[];
  methods: WithdrawalMethod[];
  onDone: () => void;
}) {
  const fundable = wallets.filter((w) => !isZeroMoney(w.available));
  // Typed off the generated schema, so the select can only ever hold a currency
  // the API actually accepts.
  type Currency = Wallet['currency'];
  const [currency, setCurrency] = React.useState<Currency>(fundable[0]?.currency ?? 'USD');
  const [amount, setAmount] = React.useState('');
  const [destination, setDestination] = React.useState('');
  /*
   * Defaulted to the first rail the SERVER returned, which is its display
   * order. With one method that makes the choice invisible and correct; with
   * several it preselects the operator's preferred one rather than leaving a
   * money form with nothing chosen.
   */
  const [methodKey, setMethodKey] = React.useState(methods[0]?.key ?? '');
  /*
   * The chosen rail's row, for its display NAME — which labels the destination
   * field when this build does not yet know the rail. `find` rather than an
   * index because the picker is keyed, and the list can be reordered by the
   * operator's `sort_order` between renders.
   */
  const selectedMethod = methods.find((m) => m.key === methodKey);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

  /*
   * `'method'` → `'details'`. The step is the only thing deciding which half of
   * the form is on screen, so there is no way to be entering an amount without
   * a rail chosen: reaching `details` requires a `methodKey`, and going back is
   * what allows it to change.
   */
  const [step, setStep] = React.useState<'method' | 'details'>('method');

  const selected = wallets.find((w) => w.currency === currency);

  /*
   * One key for this withdrawal, not one per request — R-5.2.
   *
   * It names the user's INTENT, so every attempt at the same withdrawal carries
   * the same value and the server collapses them into one. A fresh key per
   * request would make each duplicate look like a new operation, which is the
   * bug the header exists to prevent.
   *
   * A ref rather than state: nothing renders from it, and it must not reset on
   * a re-render between the first click and the second. It is minted on first
   * submit rather than at mount so no value is generated during SSR, and the
   * form unmounts on success — so the next withdrawal is a new intent with a
   * new key.
   *
   * It is NOT persisted any more. The stored copy existed to survive a refresh
   * on the confirm step, and there is no confirm step to refresh on: a reload
   * now clears an unsubmitted form, which loses typing rather than money.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    /*
     * Presence only. Whether the amount is valid, affordable or above the
     * minimum is the server's question — see the note at the top of this file.
     * The phone number's SHAPE is the server's question too: it holds Whish's
     * own rules, and a second copy here would be a second thing to drift.
     */
    if (!amount.trim()) return setError(t('withdraw.needAmount'));
    if (!methodKey) return setError(t('withdraw.needMethod'));
    if (!destination.trim()) return setError(t('withdraw.needDestination'));

    idempotencyKey.current ??= newIdempotencyKey();

    setSubmitting(true);
    try {
      await paymentsApi.requestWithdrawal(
        {
          amount: amount.trim(),
          currency,
          destination: destination.trim(),
          methodKey,
        },
        idempotencyKey.current,
      );
      onDone();
    } catch (err: unknown) {
      /*
       * The key is NOT reset here, deliberately, and this is the opposite of
       * what the old confirm step did.
       *
       * There, a refused OTP meant the request never reached the money path, so
       * the key named an intent that had produced nothing and had to be
       * discarded. Here a failure may well have created the withdrawal and lost
       * the response — so keeping the key is what makes the client's retry
       * resolve to the SAME withdrawal instead of a second one.
       */
      setError(apiErrorMessage(err, t('withdraw.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (fundable.length === 0) {
    return (
      <MoneySheet>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('withdraw.noWallets')}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/deposit">{t('wallet.deposit')}</Link>
          </Button>
        </div>
      </MoneySheet>
    );
  }

  /*
   * No enabled rail means no withdrawal is possible, and saying so is the whole
   * point: an empty method list under a working form would let a client fill in
   * an amount and be refused on submit for a reason the screen never showed.
   */
  if (methods.length === 0) {
    return (
      <MoneySheet>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground">{t('withdraw.noMethods')}</p>
        </div>
      </MoneySheet>
    );
  }

  /*
   * Quick-pick amounts, capped at what is AVAILABLE — not `balance`, which
   * includes anything already held against another pending withdrawal. A preset
   * above that would fill the field with a value the server then refuses.
   *
   * Still not a gate. The value goes to the server as a string and the server
   * re-derives every constraint (R-5.1); no comparison decides anything here.
   */
  const presets = selected ? presetsWithin(null, selected.available) : [];

  /*
   * STEP ONE — the rail, on its own.
   *
   * The method is asked first because it decides what the rest of the form
   * MEANS: the amount is the same question on every rail, but the field under
   * it is a phone number on Whish and something else on the next one. Asking
   * for a payout target before the client has said where it is going is asking
   * a question whose answer they cannot know yet.
   *
   * It stays a step even with one rail on offer. A screen with a single option
   * looks redundant today and is the shape that stays correct as rails are
   * added — and the alternative, skipping the step whenever `methods.length`
   * happens to be 1, means the flow the client learns changes under them the
   * day a second method is enabled.
   */
  if (step === 'method') {
    return (
      /*
       * `flex flex-col` with the method list growing: the sheet is now as tall
       * as the screen, so without something claiming the slack the rail, the
       * tiles and the button would bunch at the top of a mostly-empty card. The
       * SECTION grows and the footer stays pinned to the bottom edge.
       */
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <StepRail steps={[t('withdraw.stepMethod'), t('withdraw.stepDetails')]} active={0} />
        </div>

        <MoneySection title={t('withdraw.method')} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2">
            {methods.map((method) => (
              <MethodTile
                key={method.key}
                name="withdraw-method"
                value={method.key}
                checked={methodKey === method.key}
                onChange={(key) => {
                  setMethodKey(key);
                  /*
                   * Changing the rail clears the payout target. The value that
                   * was there was for a DIFFERENT rail — a Whish phone number
                   * carried into a bank field would be submitted as an account
                   * number, and the server would refuse it with a message about
                   * a field the client thought they had filled in correctly.
                   */
                  setDestination('');
                  setError(null);
                }}
                title={method.name}
                logoUrl={method.logoUrl}
              />
            ))}
          </div>
        </MoneySection>

        <MoneyFooter>
          <Button
            type="button"
            onClick={() => {
              if (!methodKey) return setError(t('withdraw.needMethod'));
              setError(null);
              setStep('details');
            }}
            className="h-10 w-full"
          >
            {t('withdraw.continue')}
          </Button>
        </MoneyFooter>
      </MoneySheet>
    );
  }

  return (
    // The form is the flex child now, so it has to carry the growth through to
    // the sheet — a plain <form> wrapper would collapse to content height and
    // the card inside it would never see the space.
    <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <StepRail steps={[t('withdraw.stepMethod'), t('withdraw.stepDetails')]} active={1} />
        </div>

        {/*
          What was chosen in step one, and the way back to change it. Without
          this the second step asks for a phone number with nothing on screen
          saying which account it is for — the client has to remember what they
          tapped.
        */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <span className="min-w-0 truncate text-xs font-semibold text-foreground">
            {selectedMethod?.name ?? methodKey}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setStep('method');
              setError(null);
            }}
            className="h-auto shrink-0 p-0 text-[11px]"
          >
            {t('withdraw.changeMethod')}
          </Button>
        </div>

        <MoneySection title={t('withdraw.amount')}>
          <div className="space-y-4">
            {/*
              The currency picker is only a QUESTION when there is more than one
              funded wallet. With a single one it is a control with one option —
              noise on a money form — so the currency is stated instead.
            */}
            {fundable.length > 1 ? (
              <DestinationSelect
                label={t('withdraw.currency')}
                value={currency}
                onChange={(value) => setCurrency(value)}
                groups={[
                  {
                    label: t('deposit.groupWallet'),
                    options: fundable.map((w) => ({
                      value: w.currency,
                      label: t('deposit.toWallet', { currency: w.currency }),
                      hint: formatMoney(w.available, w.currency),
                    })),
                  },
                ]}
              />
            ) : null}

            <AmountField
              // The enclosing MoneySection is already titled "Amount"; the
              // label stays for assistive tech only. See `labelHidden`.
              label={t('withdraw.amount')}
              labelHidden
              value={amount}
              onChange={setAmount}
              currency={currency}
              /*
               * "Use max" fills the AVAILABLE balance — not `balance`, which
               * includes whatever is already held against another pending
               * withdrawal. Offering that would produce a server refusal the
               * client cannot explain.
               *
               * This is a convenience, NOT a gate: the value still goes to the
               * server as a string and the server re-derives every constraint
               * (R-5.1). No comparison happens on this side.
               */
              max={selected ? { amount: selected.available, label: t('money.useMax') } : undefined}
              hint={
                selected
                  ? t('withdraw.available', {
                      amount: formatMoney(selected.available, selected.currency),
                    })
                  : undefined
              }
            />

            {presets.length > 0 && (
              <AmountPresets presets={presets} currency={currency} onPick={setAmount} />
            )}
          </div>
        </MoneySection>

        {/*
          The destination control is chosen by the METHOD, not fixed by this
          screen — see `withdrawal-fields.tsx`. Whish asks for a phone number;
          a rail added later asks for whatever it needs, under its own label.
        */}
        {/* The last section takes the slack, so the footer sits on the bottom
            edge of a full-height card instead of halfway up it. */}
        <MoneySection title={t('withdraw.recipient')} className="min-h-0 flex-1">
          {/*
            The "every withdrawal is reviewed by our team before any funds move"
            notice is GONE, on request. The confirmation screen already tells the
            client their request is with the team, which is the moment that
            statement is actually useful — repeating it beside the input made a
            short form longer to read for something they had not asked about yet.
          */}
          <WithdrawalDestinationField
            methodKey={methodKey}
            methodName={selectedMethod?.name ?? methodKey}
            value={destination}
            onChange={setDestination}
          />
        </MoneySection>

        <MoneyFooter className="space-y-4">
          <FormError message={error} />

          {/*
            `h-10`, not the `size="lg"` + `h-12` this had. A full-width 48px
            button under a form of 40px controls read as a landing-page CTA
            rather than as the submit of a short form — the whole screen was
            scaled up a step from the rest of the portal.
          */}
          <Button type="submit" loading={isSubmitting} className="h-10 w-full">
            {isSubmitting ? t('withdraw.submitting') : t('withdraw.submit')}
          </Button>
        </MoneyFooter>
      </MoneySheet>
    </form>
  );
}

export default function WithdrawPage() {
  const [submitted, setSubmitted] = React.useState(false);
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));
  const methods = useResource(['withdrawal-methods'], (signal) =>
    paymentsApi.getWithdrawalMethods(signal),
  );

  /*
   * ONE boundary over BOTH resources, rather than a form that renders while its
   * method list is still loading. The method decides what the destination field
   * asks for, so a form drawn without it would be asking for a value whose
   * meaning has not been established yet.
   */
  const status = wallets.status === 'ready' ? methods.status : wallets.status;

  /*
   * The card FILLS the screen rather than sitting at its content height.
   *
   * `/withdraw` is two short steps — pick a rail, then amount and recipient —
   * so on a laptop the sheet occupied about a third of the viewport with the
   * rest empty below it, and the submit button floated in the middle of nothing.
   *
   * `flex-1` works here and would NOT have before: `portal-layout` is
   * `h-dvh` with `<main>` as `flex min-h-0 flex-1 flex-col`, so this div is a
   * flex child of a column with a resolved height. That is the unbroken chain
   * `/transactions` and `/accounts` lack — which is why those two size their
   * empty states in `vh` and this one does not have to.
   *
   * `min-h-0` on the wrapper is load-bearing: without it a flex child refuses to
   * shrink below its content, so a long form on a short window would push the
   * footer off-screen instead of scrolling.
   */
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {/*
        The `<h1>Withdraw</h1>` and its subtitle are GONE, on request — the step
        rail inside the card already names where the client is, and the nav item
        they clicked said "Withdraw". The back link stays: it is the only way out
        that does not use the browser's own button.
      */}
      <MoneyHeader />

      {submitted ? (
        <MoneySheet>
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            {/*
              Says the request is WITH the desk, not that the money has been
              sent. The backend debits the wallet on request and an operator
              releases the payout; telling the client "sent" would be a
              different, wrong story about their money.

              `role="status"` so the outcome is announced: this replaces the form
              after an async submit, and a screen-reader user would otherwise be
              left on the button's last announcement.
            */}
            <div>
              <h2 role="status" className="text-lg font-bold">
                {t('withdraw.submittedTitle')}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t('withdraw.submittedBody')}
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button asChild size="sm">
                <Link href="/transactions">{t('withdraw.viewTransactions')}</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/wallet">{t('deposit.backToWallet')}</Link>
              </Button>
            </div>
          </div>
        </MoneySheet>
      ) : (
        <AsyncBoundary
          fill
          status={status}
          label={t('withdraw.loading')}
          endpoints={['GET /wallet', 'GET /payments/withdrawal-methods']}
          onRetry={() => {
            void wallets.refetch();
            void methods.refetch();
          }}
          errorMessage={apiErrorMessage(wallets.error ?? methods.error, t('withdraw.loadFailed'))}
          error={wallets.error ?? methods.error}
        >
          <WithdrawForm
            wallets={wallets.data ?? []}
            methods={methods.data ?? []}
            onDone={() => setSubmitted(true)}
          />
        </AsyncBoundary>
      )}
    </div>
  );
}
