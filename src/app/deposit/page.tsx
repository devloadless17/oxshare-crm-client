'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import {
  FormError,
  MethodTile,
  MoneyFooter,
  MoneyHeader,
  MoneySection,
  MoneySheet,
  StepRail,
} from '@/components/money/money-shell';
import {
  amountProblem,
  DepositForm,
  type DepositDestination,
} from '@/components/money/deposit-forms';
import { DepositCreated } from '@/components/money/deposit-created';
import { useResource } from '@/hooks/use-resource';
import { newIdempotencyKey } from '@/lib/api/client';
import { depositsApi, type DepositRequest, type PaymentMethod } from '@/lib/api/deposits';
import { apiErrorMessage } from '@/lib/api/errors';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Deposit — CORE-06.
 *
 * ## One screen, no steps
 *
 * Method, destination, amount, pay — all visible at once. A deposit is three
 * short decisions, and a wizard turns that into three screens with two
 * transitions and a back button: slower for the client, and a state machine for
 * us to maintain.
 *
 * Choosing a method reveals its form (`components/money/deposit-forms.tsx`).
 *
 * ## Two flows behind it, and this screen names NEITHER
 *
 *   gateway  the client is sent to the provider's hosted page, pays there, and
 *            returns to /deposit/success. The balance updates on its own.
 *   manual   the client is given a reference and sends the money from their own
 *            bank; an operator credits it once it lands.
 *
 * Which one a method uses was a `kind` field on the method, dropped in migration
 * 0043 — it described our integration, not the client's choice, and this screen
 * printed it on every tile as "Instant" or "Manual". The distinction still
 * exists and still matters, but it is announced by `DepositCreated` from the
 * server's own answer (`paymentUrl`, or not), at the moment it becomes true.
 *
 * Nothing here branches on `key` either, which `schema.ts` has always warned
 * about: a screen checking `key === 'whish'` needs editing every time a method
 * is added.
 *
 * ## The bounds come from the SERVER
 *
 * `minAmount` and `maxAmount` on the method are resolved server-side as the
 * tighter of the platform limits and any per-method ones, so the figure on the
 * screen and the figure in the validator are the same number by construction.
 * The client-side check is a courtesy that catches the mistake before a round
 * trip; the server still re-derives every constraint (R-5.1).
 *
 * ## What this screen must never imply
 *
 * That money has moved, on the manual path. `POST /payments/deposits` files a
 * `pending` row and touches no balance — the confirmation says "send your
 * transfer now" rather than "deposit created", because a client who reads the
 * second stops and waits for a balance that is never coming.
 */
export default function DepositPage() {
  const methods = useResource(['payment-methods'], (signal) => depositsApi.listMethods(signal));
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));
  const accounts = useResource(['transferable-accounts'], (signal) =>
    tradingApi.getTransferableAccounts(signal),
  );

  /*
   * `flex min-h-0 flex-1` so the card is BOUNDED by the viewport rather than as
   * tall as its contents. `<main>` is already a bounded flex column; this
   * continues that chain to the sheet, whose body then scrolls inside it. Break
   * any link in the chain and the card silently reverts to content height and
   * the footer walks off the bottom of the screen.
   */
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <MoneyHeader title={t('deposit.title')} subtitle={t('deposit.subtitle')} />

      <AsyncBoundary
        fill
        status={methods.status}
        label={t('deposit.loadingMethods')}
        endpoints={['GET /payments/methods', 'POST /payments/deposits']}
        onRetry={() => methods.refetch()}
        errorMessage={apiErrorMessage(methods.error, t('deposit.methodsFailed'))}
        error={methods.error}
      >
        <DepositFlow
          methods={methods.data ?? []}
          wallets={wallets.data ?? []}
          accounts={accounts.data ?? []}
        />
      </AsyncBoundary>
    </div>
  );
}

/**
 * Choose how to pay, say how much, then read what happens next.
 *
 * The third step is the OUTCOME and belongs in the bar: a deposit is not over
 * when the form is submitted. A gateway method sends the client onward to pay;
 * a manual one hands them a reference to quote to their bank. Which of the two
 * it is comes from the SERVER's answer, so the flow genuinely has somewhere to
 * arrive.
 */
const STEPS = [t('deposit.stepMethod'), t('money.stepAmount'), t('money.stepDone')];

function DepositFlow({
  methods,
  wallets,
  accounts,
}: {
  methods: PaymentMethod[];
  wallets: Wallet[];
  accounts: TradingAccount[];
}) {
  /*
   * The first configured method, and NOT a hardcoded key.
   *
   * The list is sorted by the operator's `sortOrder`, so the first row is the
   * one they chose to lead with. Defaulting to a literal would select nothing on
   * a deployment that does not offer that key — a form with no method and a
   * submit button that 400s.
   */
  const [methodKey, setMethodKey] = React.useState(() => methods[0]?.key ?? '');
  const [destination, setDestination] = React.useState<DepositDestination>({
    tradingAccountId: null,
  });
  const [step, setStep] = React.useState<1 | 2>(1);
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /*
   * The filed deposit AND the method it was filed against, captured together.
   *
   * The method travels with it rather than being looked up again at render time.
   * The confirmation shows `payTo` and `instructions`, and those must belong to
   * the declaration the client just made — a second lookup would read whatever
   * the radio holds NOW, so a stray click after submitting would show the client
   * the wrong account to send their money to. That is the worst thing this page
   * could do.
   */
  const [created, setCreated] = React.useState<{
    deposit: DepositRequest;
    method: PaymentMethod;
  } | null>(null);

  const selected = methods.find((m) => m.key === methodKey);

  /*
   * One key per intended deposit — R-5.2. A ref, because nothing renders from it
   * and it must not reset between the first click and a retry. Cleared on
   * success so the NEXT declaration is a new intent rather than colliding with
   * the cached first one.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  if (methods.length === 0) {
    return (
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">{t('deposit.noMethods')}</p>
          <p className="max-w-sm text-xs text-muted-foreground">{t('deposit.noMethodsBody')}</p>
        </div>
      </MoneySheet>
    );
  }

  /*
   * The outcome is STEP THREE, and keeps the step bar above it.
   *
   * A deposit does not finish when the form is submitted — a gateway sends the
   * client onward, a manual method hands them a reference to quote — so this is
   * an arrival rather than a screen that replaces the flow.
   */
  if (created) {
    return (
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <StepRail steps={STEPS} active={2} />
        <DepositCreated
          deposit={created.deposit}
          method={created.method}
          onReset={() => {
            setCreated(null);
            setStep(1);
            setAmount('');
            setError(null);
          }}
        />
      </MoneySheet>
    );
  }

  const problem = selected ? amountProblem(selected, amount) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || problem) return;

    setBusy(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();

    try {
      const deposit = await depositsApi.request(
        {
          amount,
          currency: selected.currency,
          method: selected.key,
          ...(destination.tradingAccountId
            ? { destinationTradingAccountId: destination.tradingAccountId }
            : {}),
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = null;

      /*
       * A GATEWAY deposit sends the client onward immediately.
       *
       * `location.assign` rather than `window.open`: a popup is blocked by
       * default when it is not the direct result of a click, and this is inside
       * an async submit. A blocked popup leaves the client on a screen that
       * looks like nothing happened, having already filed a deposit.
       *
       * The confirmation renders behind the navigation carrying the same link,
       * so a browser that refuses the redirect leaves a button rather than a
       * dead end.
       */
      setCreated({ deposit, method: selected });
      if (deposit.paymentUrl) window.location.assign(deposit.paymentUrl);
    } catch (err) {
      setError(apiErrorMessage(err, t('deposit.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <StepRail steps={STEPS} active={step - 1} />

        {/*
          THE one scrolling region. The rail above and the footer below stay put,
          so the submit button is on screen whatever the step contains — which is
          the whole point of bounding the card rather than letting the page grow.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 1 ? (
            <MoneySection title={t('deposit.methodTitle')}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {methods.map((method) => (
                  <MethodTile
                    key={method.key}
                    name="deposit-method"
                    value={method.key}
                    checked={method.key === methodKey}
                    onChange={(key) => {
                      setMethodKey(key);
                      /*
                       * Reset the destination when the method changes: the options
                       * are filtered by the method's CURRENCY, so an account chosen
                       * under USD is not offered under USDT and would otherwise
                       * remain selected but invisible — a deposit routed somewhere
                       * the client can no longer see.
                       */
                      setDestination({ tradingAccountId: null });
                      // The amount too: the bounds are per method, so a figure
                      // valid under one can be refused by the next.
                      setAmount('');
                    }}
                    title={method.name}
                    logoUrl={method.logoUrl}
                    disabled={busy}
                    /*
                     * NO BADGE. It read "Instant" or "Manual", from the method's
                     * `kind` — a column dropped in migration 0043 and not replaced.
                     *
                     * It described OUR integration, printed on the one control the
                     * client uses to choose how to pay. And it was wrong for a whole
                     * release: the seeded Whish row said `manual` while the Whish
                     * gateway was live, so the platform's only real method was
                     * labelled the slow one. What the client actually needs to know
                     * arrives with the outcome — a payment page, or a reference to
                     * quote — and `DepositCreated` says it then, when it is true.
                     */
                  />
                ))}
              </div>
            </MoneySection>
          ) : (
            /* The selected method's own sections — destination and amount. */
            selected && (
              <DepositForm
                method={selected}
                wallets={wallets}
                accounts={accounts}
                destination={destination}
                onDestinationChange={setDestination}
                amount={amount}
                onAmountChange={setAmount}
                disabled={busy}
              />
            )
          )}
        </div>

        <MoneyFooter className="space-y-4">
          {/* The bounds refusal, shown while the client is still on the field —
              the server's own check still runs and is authoritative. */}
          <FormError message={error ?? (step === 2 ? problem : null)} />

          {step === 1 ? (
            /*
             * `type="button"`. Inside a form a typeless button SUBMITS, which
             * here would file a deposit with no amount the moment somebody
             * pressed Enter on the method list.
             */
            <Button
              type="button"
              className="h-10 w-full"
              disabled={!selected}
              onClick={() => setStep(2)}
            >
              {t('money.continue')}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                {t('money.back')}
              </Button>
              <Button
                type="submit"
                className="h-10 flex-1"
                loading={busy}
                disabled={!selected || !amount || Boolean(problem)}
              >
                {/*
                  One busy label, because the screen cannot yet know which flow
                  it is. It said "Opening the payment page…" for a `gateway`
                  method and "Submitting…" otherwise — and the flow is decided by
                  the server's answer, which has not arrived while this label is
                  showing. Guessing it is how a client got told a payment page
                  was opening for a deposit that was never going to open one.
                */}
                {busy
                  ? t('deposit.submitting')
                  : selected && amount && !problem
                    ? t('deposit.pay', { amount: formatMoney(amount, selected.currency) })
                    : t('deposit.payNow')}
              </Button>
            </div>
          )}
        </MoneyFooter>
      </MoneySheet>
    </form>
  );
}
