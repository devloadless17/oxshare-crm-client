export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r bg-card">
        <div className="flex h-16 items-center border-b px-6">
          <span className="text-lg font-bold tracking-tight">BBCorp Portal</span>
        </div>
        <nav className="p-4 space-y-1 text-sm">
          {[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Trading Accounts', href: '/accounts' },
            { label: 'Wallet', href: '/wallet' },
            { label: 'Deposit', href: '/deposit' },
            { label: 'Withdraw', href: '/withdraw' },
            { label: 'Transactions', href: '/transactions' },
            { label: 'KYC Verification', href: '/kyc' },
            { label: 'Profile', href: '/profile' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-8">
          <div />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome back</span>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
              U
            </div>
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
