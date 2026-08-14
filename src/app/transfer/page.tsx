'use client';

import * as React from 'react';
import { ArrowRight, Wallet as WalletIcon } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import {
  AmountField,
  AmountPresets,
  FormError,
  MethodTile,
  MoneyFooter,
  MoneySection,
  MoneySheet,
  StepRail,
  SummaryRow,
} from '@/components/money/money-shell';
import { presetsWithin } from '@/components/money/amount-presets';
import { TransferSubmitted, TransferUnavailable } from '@/components/money/transfer-states';
import { useResource } from '@/hooks/use-resource';
import { newIdempotencyKey } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { paymentsApi } from '@/lib/api/payments';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Wallet ⇄ trading account, in two steps.
 *
 * ## Why the direction toggle is gone
 *
 * This screen used to ask "which way?" first, then "which account", and the two
 * questions were really one: choosing to move money OUT of a trading account is
 * choosing that account as the source. Asking separately meant a client could
 * hold a direction and an account that made no sense together, and the summary
 * at the bottom was the first place the pairing became visible.
 *
 * Now step one asks what to move money FROM — a wallet or a trading account —
 * and the direction falls out of the answer. Step two asks where it goes, and
 * the destinations are only the ones that source can actually reach.
 *
 * ## The destination list is DERIVED, not filtered by the client
 *
 * A transfer crosses one currency: a USD wallet reaches USD accounts, and an
 * account reaches the wallet in its own currency. That is not a nicety — the
 * API takes one `tradingAccountId` and a direction, so a cross-currency pairing
 * is not expressible, and offering one would produce a refusal the client
 * cannot explain.
 *
 * `GET /trading/accounts/transferable` still decides which accounts money may
 * move to at all — live and active only. This screen narrows that list by
 * currency; it does not re-implement the rule.
 *
 * ## Asynchronous, and the screen says so
 *
 * A transfer settles later: `wallet_to_account` HOLDS the amount and credits
 * nothing until the bridge confirms. So the confirmation says "submitted" and
 * "being processed", never "transferred" — a client who reads the second one
 * checks their platform, finds nothing, and files a support ticket about money
 * that is exactly where it should be.
 */
export default function TransferPage() {
  const accounts = useResource(['transferable-accounts'], (signal) =>
    tradingApi.getTransferableAccounts(signal),
  );
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));

  /*
   * No page heading.
   *
   * The rail already says Transfer, and the sheet's own steps say what the
   * screen is for. A title plus a subtitle above a card that answers the same
   * question twice is two lines of vertical space on a form whose submit button
   * should be reachable without scrolling.
   *
   * `flex min-h-0 flex-1` so the sheet can take the height the layout gives it
   * — `<main>` is a bounded flex column, and this continues that chain down to
   * the card. Break any link and the card falls back to its content height.
   */
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <AsyncBoundary
        status={accounts.status}
        label={t('transfer.loading')}
        endpoints={['GET /trading/accounts/transferable', 'POST /payments/transfers']}
        onRetry={() => accounts.refetch()}
        errorMessage={apiErrorMessage(accounts.error, t('transfer.loadFailed'))}
        error={accounts.error}
        fill
      >
        <TransferFlow accounts={accounts.data ?? []} wallets={wallets.data ?? []} />
      </AsyncBoundary>
    </div>
  );
}

/**
 * What the client is moving money out of.
 *
 * A discriminated union rather than a `direction` plus an id, because those two
 * can disagree and this cannot: a source IS a wallet or an account, and the
 * direction is read off it at submit time.
 */
type Source = { kind: 'wallet'; currency: string } | { kind: 'account'; account: TradingAccount };

/**
 * Named from the money's point of view: where it leaves, where it lands, and
 * what happened.
 *
 * The third step is the OUTCOME. It earns a place in the bar because a transfer
 * does not finish when the form is submitted — it settles later — so "Done" is a
 * state the client arrives at rather than a screen that replaces the flow.
 */
const STEPS = [t('transfer.from'), t('transfer.to'), t('money.stepDone')];

/** One row of the step-one list, with what it is worth beside it. */
interface SourceOption {
  key: string;
  source: Source;
  title: string;
  hint: string;
}

function TransferFlow({ accounts, wallets }: { accounts: TradingAccount[]; wallets: Wallet[] }) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [sourceKey, setSourceKey] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  /*
   * One key per intended transfer — R-5.2. A ref, because nothing renders from
   * it and it must not reset between the first click and a retry. Cleared on
   * success so the NEXT transfer is a new intent rather than colliding with the
   * cached first one.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  /*
   * Every place money can come from, as one list.
   *
   * Wallets first: funding an account is the common direction, and a client who
   * came here from "Fund account" is looking for their wallet. A wallet with
   * nothing in it is still listed — "you have no money here" is a different
   * statement from "this does not exist", and hiding it would leave somebody
   * hunting for a currency they hold.
   */
  const sources: SourceOption[] = [
    ...wallets.map((w): SourceOption => ({
      key: `wallet:${w.currency}`,
      source: { kind: 'wallet', currency: w.currency },
      title: t('transfer.walletLabel', { currency: w.currency }),
      /*
       * `available`, not `balance`: the difference is whatever is held against a
       * pending withdrawal, and offering that as transferable produces a refusal
       * the client cannot explain.
       */
      hint: t('money.availableBalance', { amount: formatMoney(w.available, w.currency) }),
    })),
    ...accounts.map((a): SourceOption => ({
      key: `account:${a.id}`,
      source: { kind: 'account', account: a },
      title: t('transfer.accountLabel', { login: a.login ?? t('accounts.loginPending') }),
      hint: t('money.availableBalance', { amount: formatMoney(a.balance, a.currency) }),
    })),
  ];

  const source = sources.find((s) => s.key === sourceKey)?.source;

  /*
   * Where THIS source can send money. Derived, never held in state — a stored
   * destination list would survive a change of source and offer a pairing the
   * API cannot express.
   */
  const currency = source?.kind === 'wallet' ? source.currency : source?.account.currency;
  const destinations =
    source?.kind === 'wallet'
      ? accounts.filter((a) => a.currency === source.currency)
      : source
        ? accounts.filter((a) => a.id === source.account.id)
        : [];

  /** The account the API needs, whichever end of the transfer it is on. */
  const account =
    source?.kind === 'account' ? source.account : destinations.find((a) => a.id === accountId);

  const wallet = wallets.find((w) => w.currency === currency);
  const toAccount = source?.kind === 'wallet';

  /** The balance being spent FROM, which is whichever end the source is. */
  const spendable = toAccount
    ? wallet?.available
    : source?.kind === 'account'
      ? source.account.balance
      : undefined;

  if (accounts.length === 0) {
    return <TransferUnavailable />;
  }

  /*
   * The outcome is STEP THREE, not a screen that replaces the flow.
   *
   * It keeps the step bar, so the client can see they reached the end of
   * something rather than landing on an unrelated confirmation card. The bar is
   * the only part of this screen that survives all three steps, which is what
   * makes the last one read as an arrival.
   */
  if (done) {
    return (
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <StepRail steps={STEPS} active={2} />
        <TransferSubmitted
          onAnother={() => {
            /*
             * Every field, not just the amount. The next transfer is a new
             * intent: leaving the source and destination selected would let a
             * second press of Transfer repeat the first one by accident.
             */
            setDone(false);
            setStep(1);
            setSourceKey('');
            setAccountId('');
            setAmount('');
          }}
        />
      </MoneySheet>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || !source) return;

    setBusy(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();

    try {
      await paymentsApi.requestTransfer(
        {
          tradingAccountId: account.id,
          // Read off the SOURCE, so it cannot contradict what the client picked.
          direction: toAccount ? 'wallet_to_account' : 'account_to_wallet',
          amount,
          currency: account.currency,
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = null;
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, t('transfer.failed')));
    } finally {
      setBusy(false);
    }
  };

  /*
   * Quick-pick amounts, capped at the source balance.
   *
   * A preset above what is available fills the field with a value the transfer
   * then refuses — the one-tap control would produce an error. When the source
   * is unknown (an unopened wallet) every preset is dropped rather than offered
   * against a balance nobody has confirmed.
   */
  const presets = spendable ? presetsWithin(null, spendable) : [];

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
        <StepRail steps={STEPS} active={step - 1} />

        {/*
          The one scrolling region. The footer below stays put, so the submit
          button is on screen whatever the step contains — which is the whole
          reason this card is a bounded flex column rather than a tall page.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 1 ? (
            <MoneySection title={t('transfer.from')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {sources.map((option) => (
                  <MethodTile
                    key={option.key}
                    name="transfer-source"
                    value={option.key}
                    checked={sourceKey === option.key}
                    onChange={(value) => {
                      setSourceKey(value);
                      /*
                       * Both cleared. A destination chosen for the previous
                       * source is not valid for this one, and an amount checked
                       * against the previous balance is not either.
                       */
                      setAccountId('');
                      setAmount('');
                    }}
                    title={option.title}
                    disabled={busy}
                    badge={
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {option.hint}
                      </span>
                    }
                  />
                ))}
              </div>
            </MoneySection>
          ) : (
            <>
              <MoneySection title={t('transfer.to')}>
                {destinations.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                    {t('transfer.noDestination', { currency: currency ?? '' })}
                  </p>
                ) : toAccount ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {destinations.map((option) => (
                      <MethodTile
                        key={option.id}
                        name="transfer-destination"
                        value={option.id}
                        checked={accountId === option.id}
                        onChange={setAccountId}
                        title={t('transfer.accountLabel', {
                          login: option.login ?? t('accounts.loginPending'),
                        })}
                        disabled={busy}
                        badge={
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatMoney(option.balance, option.currency)}
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  /*
                   * Coming OUT of an account there is exactly one destination —
                   * the wallet in that currency — so it is shown rather than
                   * offered as a choice of one.
                   *
                   * The balance is an em dash when no wallet exists yet: a
                   * currency the client has never held is not a zero, and the
                   * transfer is still allowed because the server owns that
                   * decision.
                   */
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <WalletIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {t('transfer.walletLabel', { currency: currency ?? '' })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {wallet
                          ? formatMoney(wallet.available, wallet.currency)
                          : t('transfer.walletUnopened')}
                      </p>
                    </div>
                  </div>
                )}
              </MoneySection>

              {account && (
                <MoneySection title={t('money.stepAmount')}>
                  <div className="space-y-4">
                    <AmountField
                      // The section above is already titled "Amount"; the label
                      // stays for assistive tech only. See `labelHidden`.
                      label={t('deposit.amountLabel')}
                      labelHidden
                      value={amount}
                      onChange={setAmount}
                      currency={account.currency}
                      disabled={busy}
                      /*
                       * "Use max" only when there is a real figure behind it. On
                       * an unopened wallet there is no available balance, and a
                       * max button that fills in nothing — or worse, a zero — is
                       * a control that misrepresents the account.
                       */
                      max={spendable ? { amount: spendable, label: t('money.useMax') } : undefined}
                      hint={
                        spendable
                          ? t('money.availableBalance', {
                              amount: formatMoney(spendable, account.currency),
                            })
                          : undefined
                      }
                    />
                    {presets.length > 0 && (
                      <AmountPresets
                        presets={presets}
                        currency={account.currency}
                        onPick={setAmount}
                        disabled={busy}
                      />
                    )}
                  </div>
                </MoneySection>
              )}

              {account && amount && (
                <MoneySection title={t('transfer.confirmTitle')}>
                  <dl className="divide-y divide-border">
                    <SummaryRow
                      label={t('transfer.from')}
                      value={
                        toAccount
                          ? t('transfer.walletLabel', { currency: account.currency })
                          : t('transfer.accountLabel', { login: account.login ?? '—' })
                      }
                    />
                    <SummaryRow
                      label={t('transfer.to')}
                      value={
                        toAccount
                          ? t('transfer.accountLabel', { login: account.login ?? '—' })
                          : t('transfer.walletLabel', { currency: account.currency })
                      }
                    />
                    <SummaryRow
                      label={t('deposit.amountLabel')}
                      value={formatMoney(amount, account.currency)}
                      strong
                    />
                  </dl>
                  <p className="mt-3 rounded-lg border border-info/30 bg-info/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {t('transfer.settlementNote')}
                  </p>
                </MoneySection>
              )}
            </>
          )}
        </div>

        <MoneyFooter className="space-y-4">
          <FormError message={error} />

          {step === 1 ? (
            /*
             * `type="button"`. Inside a form, a button with no type submits it —
             * which here would fire a transfer with no destination and no
             * amount the moment somebody pressed Enter on the source list.
             */
            <Button
              type="button"
              className="h-10 w-full"
              disabled={!source}
              onClick={() => setStep(2)}
            >
              {t('money.continue')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
                disabled={!account || !amount}
              >
                {busy ? t('transfer.submitting') : t('transfer.submit')}
              </Button>
            </div>
          )}
        </MoneyFooter>
      </MoneySheet>
    </form>
  );
}
