'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { paymentsApi, type WithdrawalMethod } from '@/lib/api/payments';
import { newIdempotencyKey } from '@/lib/api/client';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
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
 * ── ONE step, and what that replaced ────────────────────────────────────────
 *
 * This used to be two: state the withdrawal, then confirm it with a six-digit
 * code emailed to the account address and bound by HMAC to the exact amount,
 * currency, destination and provider. That step is gone at the operator's
 * request.
 *
 * The control behind it is NOT gone, and this is the part worth knowing about:
 * `withdrawal_otp` is still a switch in the admin's Settings → Security, and
 * `POST /payments/withdrawals` still refuses a codeless withdrawal while it is
 * ON. It is seeded OFF, which is what makes this form work. Turning it on
 * without restoring the confirm step would refuse every withdrawal from this
 * screen — `paymentsApi.sendWithdrawalOtp` is kept for exactly that reason.
 *
 * ── The method decides what the destination MEANS ───────────────────────────
 *
 * The rails come from `withdrawal_payment_methods` rather than a union in the
 * code, so this screen renders whatever the operator has enabled. Today that is
 * Whish Money, whose destination is a phone number — which is why the field
 * below is a phone input rather than a free-text box, and why the server
 * validates it against Whish's own rules at request time instead of days later
 * as a failed payout nobody can explain.
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
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setSubmitting] = React.useState(false);

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

  return (
    <form onSubmit={(e) => void submit(e)}>
      <MoneySheet>
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
                onChange={(value) => setCurrency(value as Currency)}
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
              label={t('withdraw.amount')}
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
          Rendered even with a single rail, unlike the currency select above.
          A payout METHOD is not an implementation detail the way a currency is
          when only one wallet is funded: the client is being asked where their
          money goes, and the answer determines what the field below means. A
          form that collected a phone number without naming Whish would be
          asking for a number with no stated purpose.
        */}
        <MoneySection title={t('withdraw.method')}>
          <div className="space-y-2">
            {methods.map((method) => (
              <MethodTile
                key={method.key}
                name="withdraw-method"
                value={method.key}
                checked={methodKey === method.key}
                onChange={setMethodKey}
                title={method.name}
                logoUrl={method.logoUrl}
              />
            ))}
          </div>
        </MoneySection>

        <MoneySection title={t('withdraw.destination')}>
          <div className="space-y-1.5">
            {/*
              A phone input, because today's only rail pays a phone number. It
              is the same control the profile and KYC screens use, so the
              country picker and formatting behave the way the client has
              already seen elsewhere.

              The value still goes to the server as a plain string and the
              server validates it against Whish's own rules — this control
              shapes the typing, it does not decide whether the number is good.

              A plain `<Label>` with no `htmlFor`: `PhoneInput` owns its own
              markup and exposes no id to point at, so a `htmlFor` here would
              name an element that does not exist — worse than no association,
              because it looks like one.
            */}
            <Label>{t('withdraw.phoneLabel')}</Label>
            <PhoneInput value={destination} onChange={setDestination} />
            <p className="text-[11px] text-muted-foreground">{t('withdraw.phoneHint')}</p>
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
            <span>{t('withdraw.reviewNote')}</span>
          </p>
        </MoneySection>

        <MoneyFooter className="space-y-4">
          <FormError message={error} />

          <Button type="submit" size="lg" loading={isSubmitting} className="h-12 w-full">
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

  return (
    <div className="w-full space-y-6">
      <MoneyHeader title={t('withdraw.title')} subtitle={t('withdraw.subtitle')} />

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
