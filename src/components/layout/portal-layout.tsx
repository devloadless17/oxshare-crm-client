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
import { t, type MessageKey } from '@/lib/i18n';

export interface NavItem {
  /** A message key, not a string — resolved through t() at render time. */
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  /** Route not built yet — rendered as a disabled "Soon" entry, never a link. */
  comingSoon?: boolean;
}

/**
 * Four of these used to be live links to routes that did not exist.
 *
 * `/deposit`, `/withdraw`, `/transactions` and `/profile` had no `page.tsx`, so
 * every one of them was a Next 404 — in the customer-facing app, in the primary
 * navigation.
 *
 * Three now exist. `/withdraw` and `/transactions` are real screens against real
 * endpoints; `/deposit` is a real route that renders BackendPending, because
 * CORE-06 is blocked on Whish/USDT credentials (§12.5) and a form with nowhere
 * to submit would be worse than the 404 it replaces — a 404 is obviously broken,
 * a form that accepts input and does nothing looks like it worked. `/profile`
 * remains unbuilt and marked. Deposit and Withdraw were also the two call-to-action buttons at
 * the top of the dashboard, which is the most likely thing a funded client
 * clicks. A client who hits 404 on "Withdraw" does not conclude that a screen is
 * unfinished; they conclude the platform cannot pay them.
 *
 * The admin app already solved this exact problem and the root CLAUDE.md records
 * its `comingSoon` treatment as the house pattern ("Unbuilt sidebar entries
 * render as disabled 'Soon' items ... they are committed scope, don't delete the
 * links"). This is that pattern, ported.
 *
 * They stay in the list rather than being deleted because they ARE committed
 * scope — CORE-06 deposit, CORE-07/08 withdrawal + OTP, IND-05 — and the backend
 * is already ahead of the UI here: POST /payments/withdrawals and
 * GET /payments/transactions both exist and are called from nowhere. Marking
 * them is an honest statement of what is not wired yet; deleting them would lose
 * the reminder that it needs to be.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'nav.accounts', href: '/accounts', icon: LineChart },
  { label: 'nav.wallet', href: '/wallet', icon: Wallet },
  { label: 'nav.deposit', href: '/deposit', icon: ArrowDownRight },
  { label: 'nav.withdraw', href: '/withdraw', icon: ArrowUpRight },
  { label: 'nav.transactions', href: '/transactions', icon: Receipt },
  { label: 'nav.kyc', href: '/kyc', icon: ShieldCheck },
  { label: 'nav.profile', href: '/profile', icon: User, comingSoon: true },
];

/**
 * The KYC badge, derived from state rather than baked into `NAV_ITEMS`.
 *
 * It used to be `badge: t('kyc.required')` — a module-level constant on the nav
 * item, evaluated once at import and never again. So the sidebar told an
 * approved client their verification was "Required" forever, while the header
 * pill five lines away read "Verified Account" off the same two values. One
 * layout, two contradictory answers to "am I verified".
 *
 * `undefined` when there is nothing to do is the point: a badge is a call to
 * action, and an approved client has no action. Rendering "Verified" here would
 * duplicate the header pill and re-teach the same lie in a quieter voice.
 *
 * Pure and exported so it can be tested without rendering the layout, and so the
 * precedence order — verified beats rejected beats in-review — is stated once.
 */
export function kycNavBadge(
  kycStatus: string | undefined,
  verificationLevel: number | undefined,
): { text: string; tone: 'warning' | 'info' | 'destructive' } | undefined {
  // Either signal is enough, and that is deliberate: this badge answers "does
  // this client still have KYC work to do", not "is the money gate open". The
  // two can disagree for a moment — approve() writes the submission status
  // first and the verification level second — and in that window the client has
  // nothing left to do either way, so prompting them would be wrong.
  //
  // The same expression drives the header pill below. Both must read the same
  // values or the layout contradicts itself again, which is the bug this
  // function exists to close.
  if (verificationLevel === 1 || kycStatus === 'approved') return undefined;
  if (kycStatus === 'rejected') return { text: t('kyc.badgeActionRequired'), tone: 'destructive' };
  if (kycStatus === 'submitted' || kycStatus === 'under_review') {
    return { text: t('kyc.badgeInReview'), tone: 'info' };
  }
  return { text: t('kyc.required'), tone: 'warning' };
}

const BADGE_TONES: Record<'warning' | 'info' | 'destructive', string> = {
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  destructive: 'bg-destructive/15 text-destructive',
};

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [logoutError, setLogoutError] = React.useState<string | null>(null);

  /**
   * Logout, with the failure made visible instead of swallowed.
   *
   * `authApi.logout` retries once and then throws, and it throws for a reason
   * worth showing: only the server can end this session — it revokes the
   * refresh-token family and clears the httpOnly cookies — so a failed call
   * leaves the client fully signed in. Navigating to the sign-in screen anyway
   * would show a logged-out page over a live session on a device that is very
   * often shared.
   */
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError(t('session.logoutFailed'));
    }
  };
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // The drawer closes where it is opened from — on the click that navigates.
  // Doing it in an effect keyed on `pathname` meant a second render pass after
  // every navigation just to flip a boolean.
  const closeMobile = () => setMobileOpen(false);

  /*
   * The sidebar badge follows the KYC status, refetched per route so it cannot
   * show 'submitted' after the user has just been approved on another tab.
   *
   * NOT fetched until the email is verified. `/kyc/*` sits behind
   * `EmailVerifiedGuard`, so for an unverified client this request is a
   * guaranteed 403 — and because `pathname` is in the key, it fired again on
   * every single navigation. One client browsing the portal produced a steady
   * stream of `403 EMAIL_NOT_VERIFIED` in the server log, which is noise that
   * buries real authorization failures.
   *
   * `enabled` rather than swallowing the error: the request was never
   * meaningful, so the right fix is not to make it.
   */
  const { data: kycStatus = 'not_started' } = useQuery({
    queryKey: ['kyc', 'status', pathname],
    queryFn: async () => {
      const res = await apiClient.get<{ status?: string }>('/kyc/status');
      return res.data?.status ?? 'not_started';
    },
    enabled: user?.emailVerified === true,
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
            <img src="/oxshare-mark.svg" alt={t('app.name')} className="h-7 w-auto shrink-0" />
            {!collapsed && (
              <div className="flex flex-col">
                <span
                  suppressHydrationWarning
                  className="text-sm font-semibold tracking-wider text-foreground"
                >
                  {t('app.name')}
                </span>
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {t('app.portalName')}
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
            // KYC is the only entry whose badge is state, not configuration.
            const badge =
              item.href === '/kyc'
                ? kycNavBadge(kycStatus, user?.verificationLevel)
                : item.badge
                  ? ({ text: String(item.badge), tone: 'warning' } as const)
                  : undefined;

            // Rendered as a div, not a disabled Link: an anchor with a dead href
            // is still navigable by keyboard, by middle-click and by a crawler.
            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  title={collapsed ? t('nav.comingSoonTitle', { label: t(item.label) }) : undefined}
                  aria-disabled="true"
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none ${
                    collapsed ? 'justify-center px-0' : ''
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                  {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                  {!collapsed && (
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {t('nav.comingSoon')}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                title={collapsed ? t(item.label) : undefined}
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
                {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
                {!collapsed && badge && (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_TONES[badge.tone]}`}
                  >
                    {badge.text}
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
              {user?.firstName ? user.firstName.charAt(0).toUpperCase() : 'U'}
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
                onClick={() => void handleLogout()}
                title={t('nav.logout')}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus-outline"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
            {logoutError && !collapsed && (
              <p role="alert" className="mt-2 text-[11px] text-destructive">
                {logoutError}
              </p>
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
                placeholder={t('nav.searchPlaceholder')}
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
              title={t('nav.notifications')}
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
