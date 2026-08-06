'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { paymentsApi } from '@/lib/api/payments';
import { newIdempotencyKey } from '@/lib/api/client';
import { clearWithdrawIntent, readWithdrawIntent, saveWithdrawIntent } from '@/lib/withdraw-intent';
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
 * ── The confirmation step (FR-CORE-08 / FR-IND-05) ──────────────────────────
 *
 * Two steps, not one: state the withdrawal, then confirm it with a code emailed
 * to the account address. The code the server issues is bound to the EXACT
 * amount, currency, destination and provider sent in step one, so a code
 * obtained for a small transfer cannot be spent on a large one — which is why
 * this form locks those fields once a code has been sent, and returns to step
 * one if the client wants to change anything.
 *
 * The operator can switch the control off (Settings → Security, master admin
 * only) for testing and before go-live. This screen does not branch on that: it
 * always asks the server to send a code, and the server answers "not required"
 * when the control is off, in which case the withdrawal submits without one. So
 * there is exactly one flow in this file, and the server decides what it means.
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

  /*
   * `'details'` → `'confirm'`. The step is the ONLY thing that decides which
   * fields are editable, so there is no way to be on the confirm step with a
   * changed amount: leaving `confirm` is what re-enables them, and it clears the
   * code with it.
   */
  const [step, setStep] = React.useState<'details' | 'confirm'>('details');
  const [otp, setOtp] = React.useState('');
  const [otpNotice, setOtpNotice] = React.useState<string | null>(null);
  const [otpRequired, setOtpRequired] = React.useState(true);

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
   */
  const idempotencyKey = React.useRef<string | null>(null);

  /*
   * Restore a withdrawal the client was part-way through — see lib/withdraw-intent.ts.
   *
   * A refresh on the confirm step used to drop back to `details` with every
   * field cleared, which sounds like lost typing and is worse: the code already
   * in their inbox is bound by HMAC to the intent it was issued for, so
   * re-entering the same amount mints a NEW intent and the emailed code can
   * never be accepted. They type the six digits they were sent, are told they
   * are wrong, and nothing explains it.
   *
   * Restoring the intent makes that code valid again. Restoring the idempotency
   * key with it is the money-path half: without it a client who submitted, lost
   * the response, and reloaded would submit again under a new key, and the
   * server would correctly treat that as a SECOND withdrawal.
   *
   * In an effect rather than a lazy `useState` initialiser, because
   * `sessionStorage` does not exist during the server render and reading it in
   * an initialiser is a hydration mismatch — the same reasoning, and the same
   * exemption, as the KYC draft restore: this IS the case the rule's own docs
   * allow — synchronising React state with an external system that the server
   * render cannot read.
   */
  React.useEffect(() => {
    const saved = readWithdrawIntent();
    if (!saved) return;

    /*
     * The stored currency has to still be one this client can withdraw. It came
     * from `sessionStorage`, so it is not trustworthy input, and a wallet can
     * empty between the two visits. Restoring a currency absent from `fundable`
     * would put the select on a value it does not offer — and on the confirm
     * step, where the field is locked and cannot be corrected.
     */
    const currencyStillFundable = fundable.find((w) => w.currency === saved.currency);
    if (!currencyStillFundable) {
      clearWithdrawIntent();
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect -- see note above */
    setCurrency(currencyStillFundable.currency);
    setAmount(saved.amount);
    setDestination(saved.destination);
    setOtpRequired(saved.otpRequired);
    idempotencyKey.current = saved.idempotencyKey;
    setStep('confirm');
    setOtpNotice(t('withdraw.restoredNotice'));
    /* eslint-enable react-hooks/set-state-in-effect */
    // `fundable` is derived from props and stable for the life of this form;
    // this restore must run once, on mount, and never re-run over what the
    // client has since typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The withdrawal, exactly as both the code request and the submission see it.
   *
   * One function, so the two calls cannot disagree about what is being
   * authorised. If they could, the server's binding check would reject a code
   * the client just requested and the failure would look like a bug in the OTP.
   */
  const intent = () => ({
    amount: amount.trim(),
    currency,
    destination: destination.trim(),
    // Derived from the currency rather than chosen by the client: a USDT
    // balance cannot be paid out through the fiat rail, and offering that
    // choice would invite a request the server must then refuse.
    provider: currency === 'USDT' ? ('usdt' as const) : ('whish' as const),
  });

  /** Step one → ask the server to email a code for THIS withdrawal. */
  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Presence only. Whether the amount is valid, affordable or above the
    // minimum is the server's question — see the note at the top of this file.
    if (!amount.trim()) return setError(t('withdraw.needAmount'));
    if (!destination.trim()) return setError(t('withdraw.needDestination'));

    setSubmitting(true);
    try {
      const { message, required } = await paymentsApi.sendWithdrawalOtp(intent());
      // A BOOLEAN from the server, never inferred from the message: the operator
      // can switch the OTP control off, and reading that out of prose would make
      // a copy edit break the withdrawal flow.
      setOtpRequired(required);
      setOtpNotice(message);
      setStep('confirm');
      /*
       * The intent begins HERE, not at submit — the server has just bound a code
       * to it. Minting the idempotency key at the same moment is what lets it be
       * persisted alongside, so a client who submits and loses the response can
       * reload and retry as the SAME withdrawal rather than a second one.
       */
      idempotencyKey.current ??= newIdempotencyKey();
      saveWithdrawIntent({
        ...intent(),
        idempotencyKey: idempotencyKey.current,
        otpRequired: required,
      });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('withdraw.otpSendFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  /** Step two → submit, with the code when one is required. */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otpRequired && !/^\d{6}$/.test(otp)) return setError(t('withdraw.needOtp'));

    idempotencyKey.current ??= newIdempotencyKey();

    setSubmitting(true);
    try {
      await paymentsApi.requestWithdrawal(
        { ...intent(), ...(otpRequired ? { otp } : {}) },
        idempotencyKey.current,
      );
      // The withdrawal exists now; nothing left to resume.
      clearWithdrawIntent();
      onDone();
    } catch (err: unknown) {
      /*
       * A rejected code must NOT reuse the idempotency key.
       *
       * The key names one intended withdrawal, and none was created — the
       * request never reached the money path. Keeping it would mean the retry
       * with a correct code collides with the cached failure and the client can
       * never complete the withdrawal they are entitled to.
       */
      idempotencyKey.current = null;
      /*
       * And drop the PERSISTED copy with it, for the same reason.
       *
       * Restoring a key the server has already answered under would collide the
       * corrected retry with the cached failure, and the client could never
       * complete a withdrawal they are entitled to. Losing the restore on a
       * refused code is the safe side of that trade: the form is still on
       * screen, and a refresh from here starts cleanly rather than resuming into
       * a poisoned key.
       */
      clearWithdrawIntent();
      setOtp('');
      setError(apiErrorMessage(err, t('withdraw.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  /** Back to step one — the only way to change a locked field. */
  const editDetails = () => {
    setStep('details');
    // Leaving the confirm step abandons the intent the code was bound to, so the
    // stored copy would restore a withdrawal the client has just chosen to
    // change.
    clearWithdrawIntent();
    // The code was bound to the OLD intent; keeping it on screen would invite
    // the client to submit it against a changed withdrawal and be refused for a
    // reason the message cannot explain well.
    setOtp('');
    setOtpNotice(null);
    setError(null);
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
      onSubmit={(e) => void (step === 'details' ? requestCode(e) : submit(e))}
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
          disabled={step === 'confirm'}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
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
          disabled={step === 'confirm'}
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
          disabled={step === 'confirm'}
        />
        <p className="text-[11px] text-muted-foreground">{t('withdraw.destinationHint')}</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-[11px] text-info">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t('withdraw.reviewNote')}</span>
      </div>

      {step === 'confirm' && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          {otpNotice && <p className="text-[11px] text-muted-foreground">{otpNotice}</p>}

          {otpRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-otp">{t('withdraw.otpLabel')}</Label>
              <Input
                id="withdraw-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
              <p className="text-[11px] text-muted-foreground">{t('withdraw.otpHint')}</p>
            </div>
          )}

          {/* The only way to change a locked field. Re-entering step one clears
              the code, because it was bound to the previous intent. */}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={editDetails}
            className="h-auto justify-start p-0 text-[11px]"
          >
            {t('withdraw.editDetails')}
          </Button>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{step === 'details' ? t('withdraw.sendingCode') : t('withdraw.submitting')}</span>
          </>
        ) : (
          <span>{step === 'details' ? t('withdraw.continue') : t('withdraw.submit')}</span>
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
          error={wallets.error}
        >
          <WithdrawForm wallets={wallets.data ?? []} onDone={() => setSubmitted(true)} />
        </AsyncBoundary>
      )}
    </div>
  );
}
