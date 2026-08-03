import type { Metadata } from 'next';
import { Wallet, ArrowDownRight, ArrowUpRight, ArrowRightLeft } from 'lucide-react';

export const metadata: Metadata = { title: 'My Wallet — OXShare' };

export default function WalletPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View your central wallet balances and manage fund allocation
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">USD Fiat Wallet</span>
            <Wallet className="h-5 w-5 text-link" />
          </div>
          <div>
            <p className="text-3xl font-bold">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">Primary Trading Fiat Wallet</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              <ArrowDownRight className="h-4 w-4" /> Deposit
            </button>
            <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-semibold hover:bg-muted">
              <ArrowUpRight className="h-4 w-4" /> Withdraw
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">USDT Crypto Wallet</span>
            <Wallet className="h-5 w-5 text-link" />
          </div>
          <div>
            <p className="text-3xl font-bold">0.00 USDT</p>
            <p className="text-xs text-muted-foreground mt-1">Tether TRC20 Wallet</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              <ArrowDownRight className="h-4 w-4" /> Deposit USDT
            </button>
            <button className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-semibold hover:bg-muted">
              <ArrowRightLeft className="h-4 w-4" /> Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
