'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
import {
  AmountField,
  AmountPresets,
  FormError,
  MoneyFooter,
  MoneyHeader,
  MoneySection,
  MoneySheet,
  StepRail,
  SummaryRow,
} from '@/components/money/money-shell';
import { presetsWithin } from '@/components/money/amount-presets';
import {
  TransferDestinations,
  TransferSubmitted,
  TransferUnavailable,
} from '@/components/money/transfer-states';
import { TileGroups } from '@/components/money/tile-groups';
import { useResource } from '@/hooks/use-resource';
import { usePreselectedTransfer } from '@/hooks/use-preselected-transfer';
import { newIdempotencyKey } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { paymentsApi } from '@/lib/api/payments';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { compareMoney, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { useMoneyRefresh } from '@/hooks/use-money-refresh';
import { buildTransferSources } from '@/lib/transfer-sources';

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
/**
 * The `<Suspense>` is required, not stylistic — same rule as `auth/login`.
 * `usePreselectedTransfer` calls `useSearchParams()`, and Next fails
 * `next build` on a page that does so outside a boundary. The tree is dynamic
 * today only because `app/layout.tsx` reads `headers()` for the CSP nonce; this
 * is what keeps the page building if the nonce ever moves.
 *
 * The fallback holds the LAYOUT and nothing else — `AsyncBoundary` renders the
 * real loading state a tick later, and a spinner here would flash ahead of it.
 */
export default function TransferPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-0 w-full flex-1" />}>
      <TransferPageContent />
    </React.Suspense>
  );
}

function TransferPageContent() {
  const accounts = useResource(keys.tradingAccounts.transferable(), (signal) =>
    tradingApi.getTransferableAccounts(signal),
  );
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal));

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
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {/*
        The way back, which this screen was missing entirely.

        Dropping the title and subtitle took the whole `MoneyHeader` with them,
        and the back link lived inside it — so /transfer was the one money screen
        with no exit but the browser's own button. The heading stays gone; the
        link comes back, and all three flows now carry the identical one.
      */}
      <MoneyHeader />

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

/**
 * Where the money leaves, where it lands, and how much.
 *
 * Three QUESTIONS, and the outcome is not one of them: the confirmation is not a
 * fourth thing the client has to do, and marking it as a step would make a
 * finished request look unfinished. /withdraw draws the same line.
 *
 * Choosing the destination is its own step rather than sharing one with the
 * amount because the amount depends on it — the balance a transfer is checked
 * against is the source's, and the pairing has to be settled before a figure
 * means anything.
 */
const STEPS = [t('transfer.from'), t('transfer.to'), t('money.stepAmount')];

function TransferFlow({ accounts, wallets }: { accounts: TradingAccount[]; wallets: Wallet[] }) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [sourceKey, setSourceKey] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const refreshMoney = useMoneyRefresh();

  /*
   * One key per intended transfer — R-5.2. A ref, because nothing renders from
   * it and it must not reset between the first click and a retry. Cleared on
   * success so the NEXT transfer is a new intent rather than colliding with the
   * cached first one.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const { walletSources, accountSources, sources } = buildTransferSources(wallets, accounts);

  /*
  /*
   * `/transfer?account=<id>` — opening on the account the client clicked
   * "Transfer funds" from. See the hook for why it is an effect rather than a
   * state seed, and why it applies only once.
   */
  usePreselectedTransfer(accounts, wallets, setSourceKey, setAccountId);

  const source = sources.find((s) => s.key === sourceKey)?.source;

  /*
   * Where THIS source can send money. Derived, never held in state — a stored
   * destination list would survive a change of source and offer a pairing the
   * API cannot express.
   */
  const currency = source?.kind === 'wallet' ? source.currency : source?.account.currency;
  const destinations = (
    source?.kind === 'wallet'
      ? accounts.filter((a) => a.currency === source.currency)
      : source
        ? accounts.filter((a) => a.id === source.account.id)
        : []
  )
    /*
     * RICHEST FIRST, as on the source list — one ordering rule across both
     * halves of the screen, so a client does not meet the same accounts in two
     * different orders on two consecutive steps.
     *
     * `filter` already returned a new array, so this sorts a copy and never
     * React Query's cached one.
     */
    .sort((a, b) => compareMoney(b.balance, a.balance));

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
   * NO step rail on the outcome — the three steps are the three questions, and
   * the confirmation is not a fourth.
   */
  if (done) {
    return (
      <MoneySheet className="flex min-h-0 flex-1 flex-col">
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
      // Both ends moved: the wallet leg and the trading account.
      await refreshMoney([[...keys.tradingAccounts.all()]]);
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
              <TileGroups
                name="transfer-source"
                groups={[
                  {
                    label: t('deposit.groupWallet'),
                    options: walletSources.map((o) => ({
                      key: o.key,
                      title: o.title,
                      hint: o.hint,
                    })),
                  },
                  {
                    label: t('deposit.groupAccounts'),
                    options: accountSources.map((o) => ({
                      key: o.key,
                      title: o.title,
                      hint: o.hint,
                    })),
                  },
                ]}
                selected={sourceKey}
                onSelect={(value) => {
                  setSourceKey(value);
                  /*
                   * Both cleared. A destination chosen for the previous source
                   * is not valid for this one, and an amount checked against the
                   * previous balance is not either.
                   */
                  setAccountId('');
                  setAmount('');
                }}
                disabled={busy}
              />
            </MoneySection>
          ) : step === 2 ? (
            <>
              <MoneySection title={t('transfer.to')}>
                <TransferDestinations
                  destinations={destinations}
                  toAccount={toAccount}
                  currency={currency}
                  wallet={wallet}
                  accountId={accountId}
                  onSelect={setAccountId}
                  disabled={busy}
                />
              </MoneySection>
            </>
          ) : (
            <>
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

              {/*
                THE confirmation, and there is only one — at the BOTTOM, under
                the field it describes.

                It renders BEFORE an amount is entered rather than appearing when
                one is: a summary that pops into existence mid-form moves
                everything beneath it and reads as a new question, when it is
                the same three facts becoming complete. From and to are known on
                arrival, so they are shown on arrival, and the amount row fills
                in as it is typed.
              */}
              <MoneySection title={t('transfer.confirmTitle')}>
                <dl className="divide-y divide-border">
                  <SummaryRow
                    label={t('transfer.from')}
                    value={
                      toAccount
                        ? t('transfer.walletLabel', { currency: currency ?? '' })
                        : t('transfer.accountLabel', {
                            login: source?.kind === 'account' ? (source.account.login ?? '—') : '—',
                          })
                    }
                  />
                  <SummaryRow
                    label={t('transfer.to')}
                    value={
                      toAccount
                        ? t('transfer.accountLabel', { login: account?.login ?? '—' })
                        : t('transfer.walletLabel', { currency: currency ?? '' })
                    }
                  />
                  <SummaryRow
                    label={t('deposit.amountLabel')}
                    /*
                      An em dash until there is a figure — never a formatted
                      zero, which would state that the client is transferring
                      nothing rather than that they have not said yet.
                    */
                    value={
                      account && amount
                        ? formatMoney(amount, account.currency)
                        : t('accounts.unknownValue')
                    }
                    strong
                  />
                </dl>
                <p className="mt-3 rounded-lg border border-info/30 bg-info/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t('transfer.settlementNote')}
                </p>
              </MoneySection>
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
          ) : step === 2 ? (
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(1)}>
                {t('money.back')}
              </Button>
              <Button
                type="button"
                className="h-10 flex-1"
                /*
                 * Needs a chosen destination, which for a wallet source means an
                 * account and for an account source is the wallet the step
                 * states rather than offers. `account` is the one value the API
                 * needs either way, so it is the one thing to check.
                 */
                disabled={!account}
                onClick={() => setStep(3)}
              >
                {t('money.continue')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
