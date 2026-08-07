'use client';

import { Wallet } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { MoneyAction } from '@/components/kyc/money-action';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet as WalletRecord, type WalletCurrency } from '@/lib/api/wallet';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * The client's balances, and the three things they can do with them.
 *
 * ## A missing wallet is not a zero
 *
 * This is the rule the whole screen turns on, and it is here because this page
 * broke it: it rendered a literal `$0.00` while `GET /wallet` worked, so a
 * client holding $700 was shown nothing. The backend rows a wallet only once it
 * exists, so a currency absent from the response has genuinely NOT BEEN OPENED
 * — which is a different sentence from "you have no money", and is rendered as
 * one. An em dash and an explanation, never a fabricated number.
 *
 * ## The actions live beside the number
 *
 * Deposit, Withdraw and Transfer are `MoneyAction`s, and these cards are the
 * only way into those routes — see the note on `NAV_ITEMS`. Moving money is
 * something a client decides while LOOKING at a balance, so the control belongs
 * next to the figure they are deciding against rather than in a navigation rail
 * two slots away from it.
 */

/**
 * Presentation order for the balance cards, and the only place the two
 * currencies are named on this screen.
 *
 * `WalletCurrency` is the generated enum, so adding a third currency
 * backend-side makes this a compile error rather than a card that silently
 * never renders.
 *
 * MESSAGE KEYS, not resolved strings — the same shape as `NAV_ITEMS`, and for
 * the reason `kycNavBadge` records: `t()` at module scope is evaluated once at
 * import and never again, so a constant built that way keeps the language it
 * was imported in for the life of the tab. `t()` is called in the render below
 * instead.
 */
const CURRENCIES: { code: WalletCurrency; label: MessageKey; note: MessageKey }[] = [
  { code: 'USD', label: 'wallet.usdWallet', note: 'wallet.usdNote' },
  { code: 'USDT', label: 'wallet.usdtWallet', note: 'wallet.usdtNote' },
];

export default function WalletPage() {
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency, w]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('wallet.heading')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('wallet.subtitle')}</p>
      </div>

      <AsyncBoundary
        status={wallets.status}
        label={t('wallet.loading')}
        endpoints={['GET /wallet']}
        onRetry={() => wallets.refetch()}
        errorMessage={apiErrorMessage(wallets.error, t('wallet.loadFailed'))}
        error={wallets.error}
      >
        <div className="grid gap-6 md:grid-cols-2">
          {CURRENCIES.map(({ code, label, note }) => (
            <BalanceCard
              key={code}
              label={t(label)}
              note={t(note)}
              currency={code}
              wallet={byCurrency.get(code)}
            />
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}

function BalanceCard({
  label,
  note,
  currency,
  wallet,
}: {
  label: string;
  note: string;
  currency: WalletCurrency;
  wallet: WalletRecord | undefined;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
        <Wallet className="h-5 w-5 text-link" aria-hidden="true" />
      </div>

      <div>
        {wallet ? (
          <>
            {/*
              `available`, not `balance` — the two differ by whatever is held
              against a pending withdrawal, and the number a client reads as
              "what I have" is the one they can actually act on. The total is
              still shown, but only underneath and only when it differs.
            */}
            <p className="text-3xl font-bold tabular-nums">
              {formatMoney(wallet.available, currency)}
            </p>
            {/* Only when something is actually held. On every other card it is
                a line explaining that nothing is happening, which is noise. */}
            {!isZeroMoney(wallet.onHold) && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('wallet.onHold', {
                  amount: formatMoney(wallet.onHold, currency),
                  total: formatMoney(wallet.balance, currency),
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{note}</p>
          </>
        ) : (
          <>
            {/*
              An em dash, and a sentence saying why. NOT `$0.00` — see the note
              at the top of this file for what that cost the last time.
            */}
            <p className="text-3xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wallet.notOpened', { currency })}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <MoneyAction
          href="/deposit"
          icon="deposit"
          label={t('wallet.deposit')}
          size="sm"
          className="flex-1"
        />
        {/*
          Withdraw and Transfer are offered on an unopened wallet too, and that
          is deliberate rather than an oversight. Both lead to a screen that
          reads the real balance and explains itself — /withdraw says plainly
          that there is nothing funded to withdraw from. Hiding the controls
          instead would leave a client with an empty card and no way to find out
          what they are for.
        */}
        <MoneyAction
          href="/withdraw"
          icon="withdraw"
          label={t('wallet.withdraw')}
          variant="outline"
          size="sm"
          className="flex-1"
        />
        <MoneyAction
          href="/transfer"
          icon="transfer"
          label={t('wallet.transfer')}
          variant="outline"
          size="sm"
          className="flex-1"
        />
      </div>
    </div>
  );
}
