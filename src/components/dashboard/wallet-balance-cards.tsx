'use client';

import { Wallet, Coins, Loader2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { walletApi } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';

/**
 * The two balance tiles on the dashboard, as a client island.
 *
 * These used to be literal `$0.00` and `0.00` in the server-rendered page while
 * `GET /wallet` existed and worked — so a client holding $500 was shown zero.
 * Only these two tiles need to be interactive, which is why this is an island
 * rather than a `'use client'` on the whole dashboard.
 */
function Tile({
  label,
  icon,
  value,
  caption,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  caption: React.ReactNode;
  accent?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-ring/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-link">
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          {caption}
          {accent}
        </div>
      </div>
    </div>
  );
}

export function WalletBalanceCards() {
  const wallets = useResource(['wallets'], (signal) => walletApi.getWallets(signal));

  const byCurrency = new Map((wallets.data ?? []).map((w) => [w.currency, w]));
  const usd = byCurrency.get('USD');
  const usdt = byCurrency.get('USDT');

  // A balance tile must never render a number it does not have. While loading it
  // spins; on failure it shows an em dash, not a zero.
  const display = (value: string | undefined, currency: 'USD' | 'USDT') => {
    if (wallets.status === 'loading') {
      return (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      );
    }
    if (value === undefined) return <span className="text-muted-foreground">—</span>;
    return formatMoney(value, currency);
  };

  return (
    <>
      <Tile
        label="Wallet Balance"
        icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        value={display(usd?.available, 'USD')}
        caption={<span className="font-medium text-foreground">USD Wallet</span>}
        accent={
          <>
            <span>•</span>
            <span className="text-success font-medium">Available</span>
          </>
        }
      />
      <Tile
        label="USDT Balance"
        icon={<Coins className="h-4 w-4" aria-hidden="true" />}
        value={display(usdt?.available, 'USDT')}
        caption={<span className="font-medium text-foreground">USDT TRC20</span>}
        accent={
          <>
            <span>•</span>
            <span>Instant Deposit</span>
          </>
        }
      />
    </>
  );
}
