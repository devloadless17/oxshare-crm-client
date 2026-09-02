'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/query-keys';

/**
 * Re-read every screen that shows the client's money.
 *
 * Four screens moved money and refreshed nothing, because none of them held a
 * `QueryClient` at all:
 *
 *  - `/deposit/[outcome]` calls `depositsApi.settle()`, which CREDITS THE
 *    WALLET, and its next control is a link straight to /wallet. Reported:
 *    "when I fund a wallet the result doesn't appear until I refresh."
 *  - `/withdraw` — the server DEBITS ON REQUEST rather than placing a hold
 *    (transactions.service.ts:706), so the balance has already fallen by the
 *    time the client is shown the confirmation.
 *  - `/transfer` — places funds on hold.
 *  - `/deposit` — creates a pending transaction row.
 *
 * Realtime does not rescue any of them, and `/deposit/[outcome]` is the clear
 * case: the client has just returned from an external redirect, so the socket
 * is still handshaking while `settle()` runs, and Socket.IO has no replay. A
 * screen that changes money must refresh it ITSELF and treat the socket as the
 * thing that keeps OTHER tabs honest.
 *
 * REFETCHED, never patched. There is no `setQueryData` here computing
 * `balance - amount`: ARCHITECTURE §6.1 bans client-side money arithmetic, and
 * an optimistic balance is precisely the plausible invented number the wallet
 * screen's rules exist to prevent. The server holds the figure; we go and ask.
 */
export function useMoneyRefresh(): (extra?: readonly unknown[][]) => Promise<void> {
  const queryClient = useQueryClient();
  /*
   * `useCallback`, because the deposit-outcome screen calls this from an
   * EFFECT. A fresh identity every render would either sit in that effect's
   * dependency list and re-settle the deposit on each render, or be omitted
   * from it and trip exhaustive-deps. `queryClient` is stable for the life of
   * the provider.
   */
  return React.useCallback(
    async (extra) => {
      await Promise.all(
        [keys.wallets.all(), keys.transactions.all(), keys.dashboard.all(), ...(extra ?? [])].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    [queryClient],
  );
}
