import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LineChart,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  ArrowRightLeft,
  ShieldCheck,
} from 'lucide-react';
import { WalletBalanceCards } from '@/components/dashboard/wallet-balance-cards';
import { t } from '@/lib/i18n';

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
              {t('dashboard.title')}
            </h1>
            <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-semibold text-info border border-info/20">
              {t('dashboard.liveBadge')}
            </span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">{t('dashboard.welcome')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/*
            Disabled, not linked: /deposit has no page, so this was a 404 on the
            most prominent control in the customer-facing app. CORE-06 is
            committed scope — the button stays, and says so.
          */}
          <button
            type="button"
            disabled
            title="Deposits are coming soon"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-muted px-4 text-xs font-semibold text-muted-foreground/70 cursor-not-allowed"
          >
            <ArrowDownRight className="h-4 w-4" />
            <span>{t('wallet.deposit')}</span>
            <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] uppercase">
              {t('nav.comingSoon')}
            </span>
          </button>
          <button
            type="button"
            disabled
            title="Withdrawals are coming soon"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-muted px-4 text-xs font-semibold text-muted-foreground/70 cursor-not-allowed"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>{t('wallet.withdraw')}</span>
            <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] uppercase">
              {t('nav.comingSoon')}
            </span>
          </button>
          <Link
            href="/accounts"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-xs font-semibold text-foreground shadow-xs hover:bg-muted focus-outline"
          >
            <Plus className="h-4 w-4" />
            <span>{t('dashboard.newAccount')}</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Live balances, from GET /wallet. */}
        <WalletBalanceCards />

        {/* The two tiles below are still placeholders, and deliberately so: no
            endpoint exists for either yet. Trading accounts and open positions
            arrive with the MT5 bridge, pending transactions with the payments
            provider integration. Wire them when those land — do not leave a
            hardcoded count next to a live balance any longer than necessary. */}

        {/* Trading Accounts */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-ring/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {t('dashboard.statTradingAccounts')}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-link">
              <LineChart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">0</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('dashboard.statActiveMt5')}</span>
              <span>•</span>
              <span className="text-info font-medium">
                {t('dashboard.openPositions', { count: 0 })}
              </span>
            </div>
          </div>
        </div>

        {/* Pending Transactions */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:border-warning/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {t('dashboard.statPendingTx')}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-2xl font-bold tracking-tight">0</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span>{t('dashboard.statThisMonth')}</span>
              <span>•</span>
              <span className="text-success font-medium">
                {t('dashboard.underReview', { count: 0 })}
              </span>
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
            <p className="text-sm font-semibold">{t('dashboard.instantDeposit')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('dashboard.instantDepositHint')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-link">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t('dashboard.internalTransfer')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('dashboard.internalTransferHint')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t('dashboard.kycStatus')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.kycVerified')}</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-base font-semibold">{t('dashboard.recentTransactions')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.recentSubtitle')}</p>
          </div>
          {/* /transactions has no page yet; GET /payments/transactions exists. */}
          <span className="text-xs font-semibold text-muted-foreground/60">
            {t('dashboard.viewAllSoon')}
          </span>
        </div>
        <div className="p-12 text-center">
          <ReceiptIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-3 text-sm font-semibold">{t('dashboard.noActivityTitle')}</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {t('dashboard.noActivityBody')}
          </p>
          <div className="mt-5">
            <button
              type="button"
              disabled
              title="Deposits are coming soon"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-muted px-4 text-xs font-semibold text-muted-foreground/70 cursor-not-allowed"
            >
              {t('dashboard.firstDepositSoon')}
            </button>
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
