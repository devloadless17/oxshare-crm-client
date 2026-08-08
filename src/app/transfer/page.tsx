'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, LineChart } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { Button } from '@/components/ui/button';
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
  SummaryRow,
} from '@/components/money/money-shell';
import { presetsWithin } from '@/components/money/amount-presets';
import { useResource } from '@/hooks/use-resource';
import { newIdempotencyKey } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { paymentsApi } from '@/lib/api/payments';
import { tradingApi, type TradingAccount } from '@/lib/api/trading';
import { walletApi, type Wallet } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Wallet ⇄ trading account.
 *
 * ## This screen was a placeholder, and now is not
 *
 * `POST /payments/transfers` has always worked. What did not exist was any way
 * for this app to learn WHICH accounts the client holds — the request body needs
 * a `tradingAccountId`, so the form needed a picker with nothing to populate it.
 *
 * The file that stood here recorded both tempting shortcuts and why they were
 * worse than an honest placeholder: a free-text account-id field asks a client
 * to type a UUID they have never seen, and a fabricated list is the failure this
 * repo has fixed twice. It named the endpoint it was waiting for.
 *
 * `GET /trading/accounts/transferable` is that endpoint. It returns live, active
 * accounts only — the server decides which accounts money may move to, and this
 * screen does not re-implement that rule. A demo account is excluded because
 * crediting real money to one is a loss with no counterparty.
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

  return (
    <div className="w-full space-y-6">
      <MoneyHeader title={t('transfer.title')} subtitle={t('transfer.subtitle')} />

      <AsyncBoundary
        status={accounts.status}
        label={t('transfer.loading')}
        endpoints={['GET /trading/accounts/transferable', 'POST /payments/transfers']}
        onRetry={() => accounts.refetch()}
        errorMessage={apiErrorMessage(accounts.error, t('transfer.loadFailed'))}
        error={accounts.error}
      >
        <TransferFlow accounts={accounts.data ?? []} wallets={wallets.data ?? []} />
      </AsyncBoundary>
    </div>
  );
}

type Direction = 'wallet_to_account' | 'account_to_wallet';

function TransferFlow({ accounts, wallets }: { accounts: TradingAccount[]; wallets: Wallet[] }) {
  const [direction, setDirection] = React.useState<Direction>('wallet_to_account');
  const [accountId, setAccountId] = React.useState(() => accounts[0]?.id ?? '');
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

  const account = accounts.find((a) => a.id === accountId);
  const wallet = wallets.find((w) => w.currency === account?.currency);

  if (accounts.length === 0) {
    return (
      <MoneySheet>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <LineChart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">{t('transfer.noAccounts')}</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('transfer.noAccountsBody')}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/accounts">{t('nav.accounts')}</Link>
          </Button>
        </div>
      </MoneySheet>
    );
  }

  if (done) {
    return (
      <MoneySheet>
        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          {/* "Submitted", not "transferred". Settlement is asynchronous. */}
          <div>
            <h2 role="status" className="text-lg font-bold">
              {t('transfer.doneTitle')}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {t('transfer.doneBody')}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button asChild size="sm">
              <Link href="/transactions">{t('deposit.trackIt')}</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDone(false);
                setAmount('');
              }}
            >
              {t('transfer.another')}
            </Button>
          </div>
        </div>
      </MoneySheet>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account) return;

    setBusy(true);
    setError(null);
    idempotencyKey.current ??= newIdempotencyKey();

    try {
      await paymentsApi.requestTransfer(
        {
          tradingAccountId: account.id,
          direction,
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

  const toAccount = direction === 'wallet_to_account';
  /*
   * The balance the client is spending FROM, which flips with the direction.
   *
   * `available` on the wallet — not `balance` — because the difference is
   * whatever is already held against a pending withdrawal, and offering that as
   * transferable would produce a refusal the client cannot explain.
   *
   * Undefined rather than zero when the wallet does not exist: a currency with
   * no wallet has not been opened, which is not the same as holding nothing.
   */
  const source = toAccount ? wallet?.available : account?.balance;

  /*
   * Quick-pick amounts, capped at the source balance.
   *
   * A preset above what is available fills the field with a value the transfer
   * then refuses — the one-tap control would produce an error. When the source
   * is unknown (an unopened wallet) every preset is dropped rather than offered
   * against a balance nobody has confirmed.
   */
  const presets = source ? presetsWithin(null, source) : [];

  return (
    <form onSubmit={(event) => void submit(event)}>
      <MoneySheet>
        <MoneySection title={t('transfer.directionTitle')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MethodTile
              name="transfer-direction"
              value="wallet_to_account"
              checked={toAccount}
              onChange={(value) => setDirection(value as Direction)}
              title={t('transfer.toAccount')}
              disabled={busy}
              badge={
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  {t('transfer.toAccountHint')}
                </span>
              }
            />
            <MethodTile
              name="transfer-direction"
              value="account_to_wallet"
              checked={!toAccount}
              onChange={(value) => setDirection(value as Direction)}
              title={t('transfer.toWallet')}
              disabled={busy}
              badge={
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                  {t('transfer.toWalletHint')}
                </span>
              }
            />
          </div>
        </MoneySection>

        <MoneySection title={t('transfer.accountTitle')}>
          <DestinationSelect
            label={t('deposit.groupAccounts')}
            value={accountId}
            onChange={setAccountId}
            disabled={busy}
            groups={[
              {
                label: t('deposit.groupAccounts'),
                options: accounts.map((option) => ({
                  value: option.id,
                  label: option.login ?? t('accounts.loginPending'),
                  hint: formatMoney(option.balance, option.currency),
                })),
              },
            ]}
          />
        </MoneySection>

        {account && (
          <MoneySection title={t('money.stepAmount')}>
            <div className="space-y-4">
              <AmountField
                label={t('deposit.amountLabel')}
                value={amount}
                onChange={setAmount}
                currency={account.currency}
                disabled={busy}
                /*
                 * "Use max" only when there is a real figure behind it. On an
                 * unopened wallet there is no available balance, and a max
                 * button that fills in nothing — or worse, a zero — is a control
                 * that misrepresents the account.
                 */
                max={source ? { amount: source, label: t('money.useMax') } : undefined}
                hint={
                  source
                    ? t('money.availableBalance', {
                        amount: formatMoney(source, account.currency),
                      })
                    : undefined
                }
              />
              {/* Capped at what is actually available, so a one-tap amount is
                  never one the transfer would refuse. */}
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

        <MoneyFooter className="space-y-4">
          <FormError message={error} />

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full"
            loading={busy}
            disabled={!account || !amount}
          >
            {busy ? t('transfer.submitting') : t('transfer.submit')}
          </Button>
        </MoneyFooter>
      </MoneySheet>
    </form>
  );
}
