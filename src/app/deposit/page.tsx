'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Check, Copy, Landmark } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResource } from '@/hooks/use-resource';
import { newIdempotencyKey } from '@/lib/api/client';
import { depositsApi, type DepositRequest, type PaymentMethod } from '@/lib/api/deposits';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Deposit — CORE-06.
 *
 * ## The methods are DATA now, and that is the whole change
 *
 * This screen used to carry a two-element `METHODS` array in the component:
 * bank transfer and USDT, with hand-written hint copy, and a closing note
 * apologising that the account details could not be shown because no endpoint
 * served them. Both halves of that are gone. `GET /payments/methods` returns
 * what the operator configured — name, logo, currency, limits, `payTo` and
 * `instructions` — and this screen renders it.
 *
 * So a new payment rail is an admin form, not a deploy. The endpoint only
 * returns methods that are enabled AND have a `payTo`, which means every row
 * here is one the client can genuinely send money to; there is no filtering to
 * add and none to forget.
 *
 * ## The operator's words, verbatim
 *
 * `instructions` and `payTo` are rendered exactly as typed and are never
 * reformatted, abbreviated or "tidied". They are an IBAN, a beneficiary name, a
 * wallet address — and this repo has already learned what inventing those costs
 * in the cheaper case of a fabricated `$0.00` balance. Wrong payment details
 * are worse than none: the money leaves and does not arrive.
 *
 * ## What this screen must never imply
 *
 * That money has moved. It has not — `POST /payments/deposits` files a
 * `pending` row and touches no balance. The confirmation step is headed "send
 * your transfer now" rather than "deposit created", because a client who reads
 * the second one stops and waits for a balance that is never coming.
 *
 * ## The currency is the method's, not a second question
 *
 * Each method carries its own currency, so there is no separate picker. Asking
 * twice invites the pair that cannot be reconciled — USDT declared, bank
 * transfer sent — and the operator matching it against a statement is the one
 * who pays for that.
 */
export default function DepositPage() {
  const methods = useResource(['payment-methods'], (signal) => depositsApi.listMethods(signal));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('deposit.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('deposit.subtitle')}</p>
      </header>

      <AsyncBoundary
        status={methods.status}
        label={t('deposit.loadingMethods')}
        endpoints={['GET /payments/methods', 'POST /payments/deposits']}
        onRetry={() => methods.refetch()}
        errorMessage={apiErrorMessage(methods.error, t('deposit.methodsFailed'))}
        error={methods.error}
      >
        <DepositFlow methods={methods.data ?? []} />
      </AsyncBoundary>
    </div>
  );
}

function DepositFlow({ methods }: { methods: PaymentMethod[] }) {
  /*
   * The first configured method, and NOT a hardcoded `'bank_transfer'`.
   *
   * The list is sorted by the operator's `sortOrder`, so the first row is the
   * one they chose to lead with. Defaulting to a literal key would select
   * nothing at all on a deployment that does not happen to offer that key —
   * leaving a form with no method selected and a submit button that 400s.
   */
  const [methodKey, setMethodKey] = React.useState(() => methods[0]?.key ?? '');
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /*
   * The filed deposit AND the method it was filed against, captured together.
   *
   * The method travels with it rather than being looked up again at render
   * time. The confirmation screen shows `payTo` and `instructions`, and those
   * must be the ones belonging to the declaration the client just made — a
   * second lookup would read whatever the radio happens to hold now, so a
   * stray click after submitting would show the client the wrong bank account
   * to send their money to. That is the worst thing this page could do.
   */
  const [created, setCreated] = React.useState<{
    deposit: DepositRequest;
    method: PaymentMethod;
  } | null>(null);

  const selected = methods.find((m) => m.key === methodKey);

  /*
   * One key for this deposit, not one per request — R-5.2.
   *
   * A ref rather than state: nothing renders from it, and it must not reset on
   * a re-render between the first click and the second. Minted on submit rather
   * than at mount so no value is generated during SSR, and cleared on success
   * so the NEXT declaration is a new intent — otherwise a client filing a second
   * genuine deposit would collide with the cached first one and be handed back
   * a reference for money they already sent.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  /*
   * NOTHING TO SEND TO. Said, rather than rendered as an empty form.
   *
   * `listAvailable` returns only methods with a `payTo`, so an empty list is
   * the operator having configured no way to receive money. A form with no
   * options would let a client type an amount and press a button that cannot
   * work, and they would read the failure as their own mistake.
   */
  if (methods.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <Landmark className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">{t('deposit.noMethods')}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          {t('deposit.noMethodsBody')}
        </p>
      </div>
    );
  }

  if (created) {
    return (
      <DepositReference
        deposit={created.deposit}
        method={created.method}
        onAnother={() => {
          setCreated(null);
          setAmount('');
        }}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    setError(null);
    setBusy(true);
    idempotencyKey.current ??= newIdempotencyKey();
    try {
      const deposit = await depositsApi.request(
        {
          // A STRING, straight from the input to the body. No parsing, no
          // rounding, no comparison against the method's limits: R-5.1 puts
          // every constraint on the server, which re-derives them from its own
          // configuration and answers with the real numbers when one is missed.
          amount: amount.trim(),
          // The method decides this. See the note at the top of the file.
          currency: selected.currency,
          method: selected.key,
        },
        idempotencyKey.current,
      );
      setCreated({ deposit, method: selected });
      // Filed. The next declaration is a different intent and needs its own key.
      idempotencyKey.current = null;
    } catch (err: unknown) {
      /*
       * The key SURVIVES a failure, unlike the withdrawal's.
       *
       * The two are not the same case. A refused OTP means no withdrawal was
       * created and the retry must look new; a failed deposit may well have
       * been filed before the response was lost, and reusing the key is what
       * makes the retry resolve to that same declaration instead of a second
       * reference for one transfer.
       */
      // The API's own message when it has one: it states the real minimum and
      // maximum, which only the server knows.
      setError(apiErrorMessage(err, t('deposit.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          {t('deposit.methodTitle')}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {methods.map((m) => (
            <MethodOption
              key={m.key}
              method={m}
              selected={m.key === methodKey}
              onSelect={() => setMethodKey(m.key)}
            />
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="amount">{t('deposit.amountLabel')}</Label>
        <div className="relative">
          <Input
            id="amount"
            /*
             * `inputMode="decimal"`, never `type="number"`.
             *
             * A number input attaches a scroll wheel that silently changes an
             * amount under the cursor, and its DOM value is a float. Money is a
             * STRING all the way to the API (§6.1) and this is the field where
             * that starts.
             */
            inputMode="decimal"
            required
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-11 pr-20 text-base"
          />
          {/* The method's currency, shown INSIDE the field rather than offered
              as a choice — it is a consequence of the row above, not a second
              decision. */}
          <span className="pointer-events-none absolute right-4 top-3 text-sm font-medium text-muted-foreground">
            {selected?.currency}
          </span>
        </div>
        {selected && <LimitsNote method={selected} />}
      </div>

      <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto">
        <span>{busy ? t('deposit.submitting') : t('deposit.submit')}</span>
        {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </form>
  );
}

/**
 * The operator's own limits, and only where they set one.
 *
 * Three separate sentences rather than one template with optional halves,
 * because a method with only a minimum must not render "Between $10 and —".
 * Both fields are nullable on the schema, and a screen that assumes otherwise
 * shows the client a bound nobody configured — which the server would then
 * contradict by accepting an amount outside it.
 *
 * Renders NOTHING when neither is set. There is no default minimum to state,
 * and inventing "from $10" would be a number this screen made up on a page
 * whose whole job is to relay the operator's terms accurately.
 */
function LimitsNote({ method }: { method: PaymentMethod }) {
  const { minAmount, maxAmount, currency } = method;

  /*
   * Each branch formats inside itself, so the narrowing that proves a value is
   * present is the same expression that reads it. Composing the sentence after
   * the branch would need a `?? ''` — and `formatMoney('')` returns the em-dash
   * fallback silently, so a bound that stopped being present would render as a
   * dash rather than fail.
   */
  const text =
    minAmount && maxAmount
      ? t('deposit.minMax', {
          min: formatMoney(minAmount, currency),
          max: formatMoney(maxAmount, currency),
        })
      : minAmount
        ? t('deposit.minOnly', { min: formatMoney(minAmount, currency) })
        : maxAmount
          ? t('deposit.maxOnly', { max: formatMoney(maxAmount, currency) })
          : // Neither bound configured. Nothing to say — and no invented "from
            // $10", which the server would then contradict by accepting $5.
            null;

  if (!text) return null;
  return <p className="text-[11px] text-muted-foreground">{text}</p>;
}

/**
 * One configured method, as a real radio.
 *
 * `<input type="radio" className="sr-only">` inside a `<label>`, and not a
 * clickable `<div>`: arrow-key navigation between options, form association,
 * and the screen-reader group semantics that make this read as ONE question
 * with N answers all come free from the element, and all are lost the moment it
 * becomes a box with an onClick.
 */
function MethodOption({
  method,
  selected,
  onSelect,
}: {
  method: PaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-input hover:bg-muted/40'
      }`}
    >
      <input
        type="radio"
        name="method"
        value={method.key}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />

      {/*
        The operator's logo when they have set one, and a neutral glyph when
        they have not. `<img>` rather than next/image: the URL is arbitrary
        operator data pointing at a host the optimizer has no configured domain
        for, and an unconfigured domain is a hard render error rather than a
        missing picture.
      */}
      {method.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={method.logoUrl}
          alt=""
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 rounded object-contain"
        />
      ) : (
        <Landmark
          className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />
      )}

      <span className="min-w-0">
        {/* The operator's name for it, not a translated label. A client
            comparing this screen against their banking app needs the same
            words in both. */}
        <span className="block text-sm font-medium text-foreground">{method.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{method.currency}</span>
      </span>
    </label>
  );
}

/**
 * The step that matters: the client has declared, and now has to actually send
 * the money.
 *
 * Headed "send your transfer now", not "deposit created". The second reads as
 * completion, and a client who believes they are done waits for a balance that
 * never arrives because they never sent anything.
 */
function DepositReference({
  deposit,
  method,
  onAnother,
}: {
  deposit: DepositRequest;
  method: PaymentMethod;
  onAnother: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('deposit.pendingTitle')}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('deposit.pendingBody', {
            // formatMoney, not the raw string: this is the number the client
            // types into a bank form, and `500.00000000` invites them to type
            // it literally.
            amount: formatMoney(deposit.amount, deposit.currency),
          })}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('deposit.referenceLabel')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-muted px-4 py-2.5 font-mono text-xl font-semibold tracking-wider text-foreground">
            {deposit.reference}
          </code>
          <CopyButton value={deposit.reference} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t('deposit.referenceWarning')}
        </p>
      </div>

      {/*
        Where the money goes — the operator's account, in the operator's words.
        Nothing here is composed by this screen. See the note at the top of the
        file on why an invented IBAN is the worst bug this page could carry.
      */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-foreground">{t('deposit.instructionsTitle')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('deposit.viaMethod', { method: method.name })}
        </p>

        {method.payTo && (
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('deposit.payToLabel')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {/*
                `break-all`, because this is an IBAN or a TRC20 address and it
                must render in full on a phone. Truncating the one string the
                client has to copy character for character would be the same
                failure as not showing it.
              */}
              <code className="min-w-0 break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {method.payTo}
              </code>
              <CopyButton value={method.payTo} />
            </div>
          </div>
        )}

        {method.instructions && (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('deposit.instructionsLabel')}
            </p>
            {/*
              `whitespace-pre-line` so the operator's line breaks survive. They
              typed a multi-line set of steps into an admin textarea, and
              collapsing it into one paragraph loses the structure they used to
              make it followable.
            */}
            <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {method.instructions}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" variant="outline" onClick={onAnother}>
          {t('deposit.newRequest')}
        </Button>
        <Link
          href="/transactions"
          className="rounded-md text-xs font-semibold text-link hover:underline focus-outline"
        >
          {t('deposit.trackIt')}
        </Link>
      </div>
    </div>
  );
}

/** Copies one value and says whether it worked. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied on insecure origins and by some browser
      // settings. The value is on screen and selectable either way, so a failed
      // copy costs nothing and needs no error.
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{copied ? t('deposit.referenceCopied') : t('deposit.copyReference')}</span>
    </Button>
  );
}
