'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  LineChart,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  ShieldCheck,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu,
  X,
  CheckCircle2,
} from 'lucide-react';
import { ThemeToggle } from '../theme-toggle';
import { useUser } from '@/context/UserContext';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Trading Accounts', href: '/accounts', icon: LineChart },
  { label: 'Wallet', href: '/wallet', icon: Wallet },
  { label: 'Deposit', href: '/deposit', icon: ArrowDownRight },
  { label: 'Withdraw', href: '/withdraw', icon: ArrowUpRight },
  { label: 'Transactions', href: '/transactions', icon: Receipt },
  { label: 'KYC Verification', href: '/kyc', icon: ShieldCheck, badge: 'Required' },
  { label: 'Profile', href: '/profile', icon: User },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // The drawer closes where it is opened from — on the click that navigates.
  // Doing it in an effect keyed on `pathname` meant a second render pass after
  // every navigation just to flip a boolean.
  const closeMobile = () => setMobileOpen(false);

  // The sidebar badge follows the KYC status, refetched per route so it cannot
  // show 'submitted' after the user has just been approved on another tab.
  const { data: kycStatus = 'not_started' } = useQuery({
    queryKey: ['kyc', 'status', pathname],
    queryFn: async () => {
      const res = await apiClient.get<{ status?: string }>('/kyc/status');
      return res.data?.status ?? 'not_started';
    },
    retry: false,
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card text-card-foreground transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-3 overflow-hidden rounded-md focus-outline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/oxshare-mark.svg" alt="OXShare" className="h-7 w-auto shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span
                  suppressHydrationWarning
                  className="text-sm font-semibold tracking-wider text-foreground"
                >
                  OXShare
                </span>
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Client Portal
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={closeMobile}
            className="flex lg:hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-outline ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    isActive
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground group-hover:text-link'
                  }`}
                />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar User Footer */}
        <div className="border-t border-border p-3">
          <div
            className={`flex items-center gap-3 rounded-lg bg-muted p-2.5 ${
              collapsed ? 'justify-center p-2' : ''
            }`}
          >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              {user?.firstName ? user.firstName[0].toUpperCase() : 'U'}
              <span
                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card ${user?.verificationLevel === 1 ? 'bg-success' : 'bg-warning'}`}
              />
            </div>

            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user ? `${user.firstName} ${user.lastName}` : 'Client User'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{user?.email || ''}</p>
              </div>
            )}

            {!collapsed && (
              <button
                type="button"
                onClick={logout}
                title="Logout"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus-outline"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur-md px-4 lg:px-8">
          {/* Left Controls */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Quick Search */}
            <div className="relative hidden sm:block w-64 md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search accounts, deposits, trades... (⌘K)"
                className="h-9 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-4 text-xs focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Account Status Badge */}
            <div
              className={`hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${
                user?.verificationLevel === 1 || kycStatus === 'approved'
                  ? 'border-success/30 bg-success/10 text-success'
                  : kycStatus === 'rejected'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive font-bold animate-pulse'
                    : kycStatus === 'submitted' || kycStatus === 'under_review'
                      ? 'border-info/30 bg-info/10 text-info'
                      : 'border-warning/30 bg-warning/10 text-warning'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {user?.verificationLevel === 1 || kycStatus === 'approved'
                  ? 'Verified Account'
                  : kycStatus === 'rejected'
                    ? '⚠️ KYC Action Required'
                    : kycStatus === 'submitted' || kycStatus === 'under_review'
                      ? 'KYC Under Review'
                      : 'KYC Pending'}
              </span>
            </div>

            {/* Notifications */}
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted focus-outline"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>

            {/* Theme Toggle (next-themes) */}
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
