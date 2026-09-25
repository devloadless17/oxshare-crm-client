'use client';

import * as React from 'react';
import { useResource } from '@/hooks/use-resource';
import { walletApi } from '@/lib/api/wallet';
import { tradingApi } from '@/lib/api/trading';
import type { Transaction } from '@/lib/api/payments';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export interface TransferEnds {
  from: string;
  to: string;
}

/**
 * Both ends of a transfer, by NAME — "USD Wallet" and "Main · #7001" — rather
 * than the generic "Wallet → Trading account".
 *
 * A client with two trading accounts could not tell from any screen which one
 * a transfer went to. The row carries `walletId` and `tradingAccountId`; this
 * resolves them against the client's own wallets and accounts, the same two
 * lists the wallet and accounts screens already hold (same query keys, so
 * usually no extra request).
 *
 * `direction` is wallet-side for every row: `withdrawal` is money that LEFT the
 * wallet (wallet → account), `deposit` money that ARRIVED (account → wallet).
 * A commission transfer only ever runs commission wallet → main wallet.
 *
 * An id that does not resolve — an account since closed and dropped from the
 * list, or a list still loading — falls back to the generic word, never to a
 * blank or a raw id.
 */
export function useTransferEnds(enabled = true): (tx: Transaction) => TransferEnds | null {
  const wallets = useResource(keys.wallets.all(), (signal) => walletApi.getWallets(signal), {
    enabled,
  });
  const accounts = useResource(
    keys.tradingAccounts.all(),
    (signal) => tradingApi.getAccounts(signal),
    { enabled },
  );

  return React.useCallback(
    (tx: Transaction) => {
      if (tx.kind !== 'transfer' && tx.kind !== 'commission_transfer') return null;

      const wallet = (wallets.data ?? []).find((w) => w.id === tx.walletId);
      const walletName =
        wallet?.name?.trim() || t('transfer.walletFallback', { currency: tx.currency });

      if (tx.kind === 'commission_transfer') {
        return { from: t('transfer.commissionWallet'), to: walletName };
      }

      const account = (accounts.data ?? []).find((a) => a.id === tx.tradingAccountId);
      const accountName = account
        ? [
            account.name?.trim() || t('transfer.tradingAccount'),
            account.login ? `#${account.login}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : t('transfer.tradingAccount');

      return tx.direction === 'withdrawal'
        ? { from: walletName, to: accountName }
        : { from: accountName, to: walletName };
    },
    [wallets.data, accounts.data],
  );
}
