'use client';

import { Wallet, ArrowDownRight, ArrowUpRight, ArrowRightLeft } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet as WalletRecord } from '@/lib/api/wallet';
import { formatMoney, isZeroMoney } from '@/lib/money';

/**
 * Presentation order for the balance cards. The backend only rows a wallet once
 * it exists, so a currency missing from the response has genuinely not been
 * opened yet — which is rendered as such rather than as a fabricated $0.00.
 */
const CURRENCIES = [
  { code: 'USD' as const, label: 'USD Fiat Wallet', note: 'Primary Trading Fiat Wallet' },
  { code: 'USDT' as const, label: 'USDT Crypto Wallet', note: 'Tether TRC20 Wallet' },
];

function BalanceCard({
  label,
  note,
  currency,
  wallet,
  children,
}: {
  label: string;
  note: string;
  currency: 'USD' | 'USDT';
  wallet: WalletRecord | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
        <Wallet className="h-5 w-5 text-link" aria-hidden="true" />
      </div>
      <div>
        {wallet ? (
          <>
            <p className="text-3xl font-bold">{formatMoney(wallet.available, currency)}</p>
            {/* Only surface on-hold when something is actually held, otherwise
                it is noise on every card. */}
            {!isZeroMoney(wallet.onHold) && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatMoney(wallet.onHold, currency)} on hold ·{' '}
                {formatMoney(wallet.balance, currency)} total
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{note}</p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-1">
              Not opened yet. This wallet appears after your first {currency} deposit.
            </p>
          </>
        )}
      </div>
      <div className="flex gap-2 pt-2">{children}</div>
    </div>
  );
}

export default function WalletPage() {
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency, w]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View your central wallet balances and manage fund allocation
        </p>
      </div>

      <AsyncBoundary
        status={wallets.status}
        label="Loading your wallet balances"
        endpoints={['GET /wallet']}
        onRetry={() => void wallets.refetch()}
        errorMessage={apiErrorMessage(wallets.error, 'Could not load your wallet balances.')}
      >
        <div className="grid gap-6 md:grid-cols-2">
          {CURRENCIES.map(({ code, label, note }) => (
            <BalanceCard
              key={code}
              label={label}
              note={note}
              currency={code}
              wallet={byCurrency.get(code)}
            >
              <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
                <ArrowDownRight className="h-4 w-4" aria-hidden="true" />{' '}
                {code === 'USD' ? 'Deposit' : 'Deposit USDT'}
              </button>
              <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-semibold hover:bg-muted">
                {code === 'USD' ? (
                  <>
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> Withdraw
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Transfer
                  </>
                )}
              </button>
            </BalanceCard>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}
