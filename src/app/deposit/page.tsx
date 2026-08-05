'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Banknote, Check, Coins, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { depositsApi, type DepositMethod, type DepositRequest } from '@/lib/api/deposits';
import { apiErrorMessage } from '@/lib/api/errors';
import { formatMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * Deposit — CORE-06, and real now.
 *
 * This page rendered `BackendPending` naming `POST /payments/deposits` and
 * `POST /webhooks/payments/:provider`, both "blocked on Whish/USDT credentials
 * (§12.5)". That was true of the AUTOMATED flow and only the automated flow.
 *
 * The flow every broker runs regardless needs no third-party credential: the
 * client says what they are sending, gets a reference, transfers the money
 * quoting it, and the operator credits the wallet once it lands. So the webhook
 * the placeholder named is still unbuilt, and this screen calls a different
 * endpoint that was always buildable.
 *
 * ## What this screen must never imply
 *
 * That money has moved. It has not — `POST /payments/deposits` files a
 * `pending` row and touches no balance. The confirmation step is headed "send
 * your transfer now" rather than "deposit created", because a client who reads
 * the second one stops and waits for a balance that is never coming.
 *
 * ## Why the bank details are not on this page
 *
 * They are operator data — an IBAN, a beneficiary name, a USDT address — and
 * hardcoding them here would be inventing them, which is the same failure as
 * the fake `$0.00` balances this repo already had to fix. No endpoint serves
 * them yet, so the screen says who will send them rather than showing a
 * plausible account number nobody has verified. Wrong payment details are worse
 * than none: the money leaves and does not arrive.
 */

interface MethodOption {
  key: DepositMethod;
  currency: 'USD' | 'USDT';
  icon: React.ElementType;
  label: MessageKey;
  hint: MessageKey;
}

const METHODS: MethodOption[] = [
  {
    key: 'bank_transfer',
    currency: 'USD',
    icon: Banknote,
    label: 'deposit.methodBank',
    hint: 'deposit.methodBankHint',
  },
  {
    key: 'usdt_trc20',
    currency: 'USDT',
    icon: Coins,
    label: 'deposit.methodUsdt',
    hint: 'deposit.methodUsdtHint',
  },
];

export default function DepositPage() {
  const [method, setMethod] = React.useState<DepositMethod>('bank_transfer');
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<DepositRequest | null>(null);

  const currency: 'USD' | 'USDT' = method === 'usdt_trc20' ? 'USDT' : 'USD';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setCreated(await depositsApi.request(amount, currency, method));
    } catch (err: unknown) {
      // The API's own message when it has one: it states the real minimum and
      // maximum, which only the server knows.
      setError(apiErrorMessage(err, t('deposit.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('deposit.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('deposit.subtitle')}</p>
      </header>

      {created ? (
        <DepositReference
          deposit={created}
          onAnother={() => {
            setCreated(null);
            setAmount('');
          }}
        />
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-6 rounded-xl border border-border bg-card p-6"
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
              {METHODS.map((m) => {
                const Icon = m.icon;
                const selected = method === m.key;
                return (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-input hover:bg-muted/40'
                    }`}
                  >
                    {/* A real radio, visually hidden rather than replaced by a
                        div: arrow-key navigation, form association and the
                        screen-reader group semantics all come free, and all are
                        lost the moment this becomes a clickable box. */}
                    <input
                      type="radio"
                      name="method"
                      value={m.key}
                      checked={selected}
                      onChange={() => setMethod(m.key)}
                      className="sr-only"
                    />
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${
                        selected ? 'text-primary' : 'text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t(m.label)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {t(m.hint)}
                      </span>
                    </span>
                  </label>
                );
              })}
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
                 * A number input attaches a scroll wheel that silently changes
                 * an amount under the cursor, and its DOM value is a float.
                 * Money is a STRING all the way to the API (§6.1) and this is
                 * the field where that starts.
                 */
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-11 pr-16 text-base"
              />
              <span className="pointer-events-none absolute right-4 top-3 text-sm font-medium text-muted-foreground">
                {currency}
              </span>
            </div>
          </div>

          <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t('deposit.submitting')}</span>
              </>
            ) : (
              <>
                <span>{t('deposit.submit')}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      )}
    </div>
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
  onAnother,
}: {
  deposit: DepositRequest;
  onAnother: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deposit.reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied on insecure origins and by some browser
      // settings. The reference is on screen and selectable either way, so a
      // failed copy costs nothing and needs no error.
    }
  };

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

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('deposit.referenceLabel')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-muted px-4 py-2.5 font-mono text-xl font-semibold tracking-wider text-foreground">
            {deposit.reference}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{copied ? t('deposit.referenceCopied') : t('deposit.copyReference')}</span>
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {t('deposit.referenceWarning')}
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6">
        <h3 className="text-sm font-semibold text-foreground">{t('deposit.instructionsTitle')}</h3>
        {/*
          The account details are NOT hardcoded here — see the note at the top
          of this file. Inventing an IBAN is the same failure as the fake $0.00
          balances, with a worse outcome: the money leaves and does not arrive.
        */}
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('deposit.instructionsPending')}
        </p>
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
