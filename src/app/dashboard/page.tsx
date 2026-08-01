import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — BBCorp Portal',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your trading overview</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Wallet Balance', value: '$0.00', sub: 'USD' },
          { label: 'USDT Balance', value: '0.00', sub: 'USDT' },
          { label: 'Trading Accounts', value: '0', sub: 'Active' },
          { label: 'Pending Transactions', value: '0', sub: 'This month' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold mt-2">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Recent Transactions</h2>
        </div>
        <div className="p-6 text-center text-muted-foreground text-sm">
          No transactions yet. Make your first deposit to get started.
        </div>
      </div>
    </div>
  );
}
