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
import { keys } from '@/lib/query-keys';
import { useMoneyRefresh } from '@/hooks/use-money-refresh';

/**
 * Deposit — CORE-06.
 *
 * ## Three steps: method, destination, amount
 *
 * This was one screen with everything visible at once, and the comment here
 * argued for it — a deposit is three short decisions, and a wizard makes three
 * screens out of them. That was changed on request, and the destination step is
 * what earns the change: choosing a trading account turns one deposit into TWO
 * movements (the credit into the wallet, then a transfer onward), which is worth
 * asking plainly rather than burying in a dropdown above the amount field.
 *
 * There is no fourth step for the outcome — see `STEPS`.
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
 * exists and still matters, but it is answered by the server (`paymentUrl`, or
 * not) at the moment it becomes true: a gateway deposit navigates STRAIGHT to
 * the provider, and only a manual one renders `DepositCreated` with its
 * reference and pay-to details.
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
  const methods = useResource(keys.paymentMethods.deposit(), (signal) =>
    depositsApi.listMethods(signal),
  );
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal));
  const accounts = useResource(keys.tradingAccounts.transferable(), (signal) =>
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
      {/*
        The back link alone — no `<h1>Deposit</h1>` and no subtitle.

        The nav item the client just pressed said Deposit, and the card's own
        step rail names where they are, so a heading plus a sentence above it was
        the third thing on screen answering a question nobody had. It also cost
        two lines of the height the card wants for its scrolling body.

        The link is NOT dropped with them: it is the only way out of this screen
        that is not the browser's own button, and it lives in `MoneyHeader` so
        all three money flows keep the same one rather than each rendering its
        own and drifting.
      */}
      <MoneyHeader />

      <AsyncBoundary
        fill
        status={methods.status}
        label={t('deposit.loadingMethods')}
        endpoints={['GET /payments/methods', 'POST /payments/deposits']}
        onRetry={() => methods.refetch()}
        errorMessage={t('deposit.methodsFailed')}
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
 * Method, then WHERE the money lands, then how much.
 *
 * The destination is its own step rather than a dropdown above the amount,
 * because it is the decision that changes what the deposit DOES: routed to a
 * trading account it becomes two movements — the deposit into the wallet, then a
 * transfer onward — and that is worth asking plainly rather than burying in a
 * select.
 *
 * No outcome step. The three steps are the three questions; a confirmation is
 * not a fourth thing the client has to do, and marking it as one makes a
 * finished request look unfinished. /withdraw and /transfer draw the same line.
 */
const STEPS = [t('deposit.stepMethod'), t('deposit.stepDestination'), t('deposit.stepAmountShort')];

/**
 * How long to wait before deciding the redirect did not happen.
 *
 * Long enough that a working navigation always wins the race — the page unloads
 * and the timer dies with it — and short enough that a client whose browser
 * refused it is not left watching a spinner. It is a FALLBACK, not a delay:
 * nobody sees this wait unless something went wrong.
 */
const REDIRECT_FALLBACK_MS = 2500;

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
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refreshMoney = useMoneyRefresh();
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
   * NO step rail on the outcome — the three steps are the three questions, and
   * the confirmation is not a fourth.
   */
  if (created) {
    return (
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
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

    /*
     * Set when the browser is on its way to the provider, so `finally` leaves
     * the form disabled. Without it the button re-enables mid-navigation and a
     * quick second press files a SECOND deposit against a fresh idempotency key.
     */
    let leaving = false;

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
       * A pending transaction row now exists. Not awaited: on the gateway path
       * the browser is about to leave, and holding the redirect on a refetch
       * the client will never see is the wrong trade. On the MANUAL path the
       * page stays, and this is what puts the declared deposit on /transactions
       * without a reload.
       */
      void refreshMoney();

      /*
       * A GATEWAY deposit goes STRAIGHT to the provider — no card in between.
       *
       * This used to render the confirmation first and navigate second, so a
       * client paying by Whish met a "your payment link is ready" screen with a
       * button, and then the redirect. Two screens for one intention, and the
       * first one asks them to press something they did not ask for.
       *
       * `location.assign` rather than `window.open`: a popup is blocked by
       * default when it is not the direct result of a click, and this is inside
       * an async submit. A blocked popup leaves the client on a screen that
       * looks like nothing happened, having already filed a deposit.
       *
       * ## The card is still the FALLBACK, just no longer the default
       *
       * If the navigation is refused — an extension, a hardened browser, a
       * provider URL that will not load — the client would otherwise sit on a
       * form that is spinning forever, having already filed a deposit. So the
       * confirmation is scheduled rather than rendered: if this page is still
       * here a moment later, the navigation did not happen and the card appears
       * with its link. When the redirect works the page unloads first and the
       * timer never fires.
       */
      if (deposit.paymentUrl) {
        const url = deposit.paymentUrl;
        window.setTimeout(() => setCreated({ deposit, method: selected }), REDIRECT_FALLBACK_MS);
        leaving = true;
        window.location.assign(url);
        // Deliberately left busy: the form stays disabled while the browser
        // navigates, so a second submit cannot file a second deposit.
        return;
      }

      // A MANUAL method has nowhere to send anybody — the reference and the
      // pay-to details ARE the outcome.
      setCreated({ deposit, method: selected });
    } catch (err) {
      setError(apiErrorMessage(err, t('deposit.failed')));
    } finally {
      // `finally` runs on the redirect path's `return` too, so it is guarded:
      // re-enabling the form while the page is unloading is the double-submit
      // window this whole flow is built to avoid.
      if (!leaving) setBusy(false);
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
            /* The selected method's own sections, one per step. */
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
                section={step === 2 ? 'destination' : 'amount'}
              />
            )
          )}
        </div>

        <MoneyFooter className="space-y-4">
          {/* The bounds refusal, shown while the client is still on the field —
              the server's own check still runs and is authoritative. */}
          <FormError message={error ?? (step === 3 ? problem : null)} />

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
          ) : step === 2 ? (
            /*
             * STEP TWO HAS ITS OWN BUTTONS, and their absence was a real bug:
             * this branch did not exist, so the destination step fell through to
             * the SUBMIT button below — which is disabled until an amount is
             * entered, and the amount is asked for on the next step. A client
             * who picked a destination found Continue permanently greyed out
             * with nothing on screen explaining what was missing.
             *
             * Nothing to validate here. A destination is always selected: the
             * wallet is the default and the tiles are a radio group, so there is
             * no empty state to guard against.
             */
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(1)}>
                {t('money.back')}
              </Button>
              <Button type="button" className="h-10 flex-1" onClick={() => setStep(3)}>
                {t('money.continue')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() => setStep(2)}
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
