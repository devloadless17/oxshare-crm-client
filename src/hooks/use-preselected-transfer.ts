'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';

/**
 * `/transfer?account=<id>` — opening the transfer screen on a chosen account.
 *
 * The client clicked "Transfer funds" ON an account, so they have already
 * answered "which one". This seeds that account as the DESTINATION and the
 * wallet in its currency as the SOURCE, rather than making them find it again
 * among every wallet and account they hold.
 *
 * Wallet-to-account rather than the reverse, because that is what the menu item
 * says — and it only appears on live, active accounts, which is exactly the set
 * that can receive money. Withdrawing FROM an account is the same screen reached
 * without a parameter, so no direction is hidden by choosing one here.
 *
 * ## Honoured only when both ends genuinely exist
 *
 * The id is matched against the accounts the client actually holds, never
 * trusted from the URL: a hand-edited link or a stale bookmark must not name a
 * stranger's account on their screen. A wallet in the matching currency is
 * required too — seeding a destination with no usable source produces a form
 * that opens half-filled and cannot be completed, which is worse than one that
 * opens empty.
 *
 * ## Why an effect and not a `useState` initialiser
 *
 * The transfer screen's `AsyncBoundary` gates on the ACCOUNTS request only, so
 * the first render can happen while wallets are still in flight. A state
 * initialiser runs exactly once, on that render, when there is no wallet to
 * match yet — so the seed would silently do nothing whenever the wallet request
 * was the slower of the two. That is the intermittent kind of bug that looks
 * like the link works for some clients and not others.
 *
 * ## It is an opening position, not a constraint
 *
 * `applied` latches after the first successful application. Without it, a client
 * who changed the source away from the suggested wallet would have it put
 * straight back on the next render, which reads as a broken picker.
 */
export function usePreselectedTransfer(
  accounts: TradingAccount[],
  wallets: Wallet[],
  setSourceKey: (key: string) => void,
  setAccountId: (id: string) => void,
): void {
  const requestedAccountId = useSearchParams().get('account') ?? '';

  const preselected = React.useMemo(() => {
    if (!requestedAccountId) return null;
    const account = accounts.find((a) => a.id === requestedAccountId);
    if (!account) return null;
    const wallet = wallets.find((w) => w.currency === account.currency);
    if (!wallet) return null;
    return { accountId: account.id, sourceKey: `wallet:${wallet.currency}` };
  }, [accounts, wallets, requestedAccountId]);

  const applied = React.useRef(false);
  // The setters are absent from the dependency list on purpose: React guarantees
  // `useState` setters are stable, so listing them would add noise without
  // changing when this runs. `preselected` is the only input that can change.
  React.useEffect(() => {
    if (applied.current || !preselected) return;
    setSourceKey(preselected.sourceKey);
    setAccountId(preselected.accountId);
    applied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselected]);
}
