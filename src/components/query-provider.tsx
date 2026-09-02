'use client';

// TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
// Behaviour changes belong in BOTH. Anything app-specific (cookie names,
// token lifetimes, redirect paths, endpoint patterns) goes in the config block
// at the top of the file, never inline — that is what keeps a diff between the
// two copies a signal rather than noise.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Matches the admin app's setup, so both frontends fetch the same way.
 *
 * Retrying a 4xx just burns time — a 404 means the endpoint is not built and a
 * 400 means the request was wrong. Neither is fixed by asking again.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            /*
             * ON, and bounded by `staleTime` above.
             *
             * This was `false`, which is not React Query's default — it was
             * turned off deliberately and cost more than it saved. The workflow
             * this app is actually used in is: look at the portal, switch to the
             * MT5 terminal, trade, switch back. Coming back is EXACTLY the
             * moment the numbers on screen are known to be behind, and it was
             * the one moment nothing re-asked. A balance that had been correct
             * in the database for ten minutes kept rendering the figure from
             * before the trade, and the screen read as broken sync when the sync
             * had already happened.
             *
             * It cannot stampede: React Query only refetches a query on focus
             * when that query is STALE, so `staleTime: 30_000` means at most one
             * refresh per query per thirty seconds however often somebody
             * alt-tabs.
             */
            refetchOnWindowFocus: true,
            retry: (failureCount, error: unknown) => {
              const status = (error as { response?: { status?: number } })?.response?.status;
              if (status !== undefined && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
