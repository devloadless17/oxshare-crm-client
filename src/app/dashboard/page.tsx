import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Wallet,
  Coins,
  LineChart,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Dashboard — OXShare',
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl border border-border bg-card p-6 lg:p-8 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
              Trading Overview
            </h1>
            <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-semibold text-info border border-info/20">
              Live MT5 Sync
            </span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">
            Welcome back! Monitor your live balances, trading accounts, and recent transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/deposit"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary-hover focus-outline"
          >
            <ArrowDownRight className="h-4 w-4" />
            <span>Deposit</span>
          </Link>
          <Link
            href="/withdraw"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground shadow-xs hover:bg-muted focus-outline"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Withdraw</span>
          </Link>
          <Link
            href="/accounts"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground shadow-xs hover:bg-muted focus-outline"
          >
            <Plus className="h-4 w-4" />
            <span>New Account</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Wallet Balance */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-ring/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Wallet Balance</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-link">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">$0.00</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">USD Wallet</span>
              <span>•</span>
              <span className="text-success font-medium">Available</span>
            </div>
          </div>
        </div>

        {/* Crypto Balance */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-ring/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">USDT Balance</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-link">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">0.00</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">USDT TRC20</span>
              <span>•</span>
              <span>Instant Deposit</span>
            </div>
          </div>
        </div>

        {/* Trading Accounts */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-ring/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Trading Accounts</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-link">
              <LineChart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">0</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Active MT5</span>
              <span>•</span>
              <span className="text-info font-medium">0 Open Positions</span>
            </div>
          </div>
        </div>

        {/* Pending Transactions */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-warning/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Pending Transactions</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">0</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span>This Month</span>
              <span>•</span>
              <span className="text-success font-medium">0 Under Review</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Grid & Security Banner */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-link">
            <ArrowDownRight className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Instant Deposit</p>
            <p className="text-xs text-muted-foreground mt-0.5">Fund your wallet via USDT or Wire</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-link">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Internal Transfer</p>
            <p className="text-xs text-muted-foreground mt-0.5">Move funds between MT5 accounts</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">KYC Status</p>
            <p className="text-xs text-muted-foreground mt-0.5">Level 1 Verified • Trading Enabled</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-base font-semibold">Recent Transactions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Latest deposits, withdrawals, and MT5 transfers</p>
          </div>
          <Link
            href="/transactions"
            className="text-xs font-semibold text-link hover:underline rounded-xs focus-outline"
          >
            View All
          </Link>
        </div>
        <div className="p-12 text-center">
          <ReceiptIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-3 text-sm font-semibold">No Transactions Recorded Yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Your recent deposits, withdrawals, and internal transfers will appear here automatically.
          </p>
          <div className="mt-5">
            <Link
              href="/deposit"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover focus-outline"
            >
              Make Your First Deposit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 6v12" />
    </svg>
  );
}
