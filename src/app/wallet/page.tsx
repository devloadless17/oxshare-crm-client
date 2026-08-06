'use client';

import { Wallet, ArrowRightLeft } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { MoneyAction } from '@/components/kyc/money-action';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { walletApi, type Wallet as WalletRecord } from '@/lib/api/wallet';
import { formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

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
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
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
            <p className="text-3xl font-bold text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('wallet.notOpened', { currency })}
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
  const kyc = useKycAccess();

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
        onRetry={() => void wallets.refetch()}
        errorMessage={apiErrorMessage(wallets.error, t('wallet.loadFailed'))}
        error={wallets.error}
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
              {/*
                These are the ONLY way into /deposit and /withdraw, which is
                deliberate: moving money is something a client decides while
                looking at a balance, so the action belongs beside the number
                rather than in a navigation rail two slots apart from it.
              */}
              <MoneyAction
                href="/deposit"
                icon="deposit"
                label={code === 'USD' ? t('wallet.deposit') : t('wallet.depositUsdt')}
                size="sm"
                className="flex-1"
              />
              {code === 'USD' ? (
                <MoneyAction
                  href="/withdraw"
                  icon="withdraw"
                  label={t('wallet.withdraw')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                />
              ) : !kyc.approved ? (
                /*
                  Transfer has no route yet, but for a client who is not verified
                  that is not the FIRST thing standing in their way — and telling
                  them "coming soon" when the actual answer is "verify first"
                  sends them away from the one thing they can act on. So while
                  they are blocked, all three controls say the same thing.
                */
                <MoneyAction
                  href="/transfer"
                  icon="transfer"
                  label={t('wallet.transfer')}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                />
              ) : (
                // Verified, and there is genuinely nothing behind this yet.
                // Rendered disabled and labelled rather than as a live-looking
                // button, for the same reason the sidebar marks unbuilt entries:
                // a control that accepts a click and does nothing reads as a
                // broken product, not an unfinished one.
                <span
                  aria-disabled="true"
                  title={t('nav.comingSoonTitle', { label: t('wallet.transfer') })}
                  className="flex-1 inline-flex h-8 cursor-not-allowed select-none items-center justify-center gap-1.5 rounded-md border border-input bg-muted/40 px-3 text-xs font-semibold text-muted-foreground/70"
                >
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> {t('wallet.transfer')}
                </span>
              )}
            </BalanceCard>
          ))}
        </div>
      </AsyncBoundary>
    </div>
  );
}
