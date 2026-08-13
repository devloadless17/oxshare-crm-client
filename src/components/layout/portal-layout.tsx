'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Handshake,
  LayoutDashboard,
  LineChart,
  MonitorDown,
  Receipt,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldAlert,
  Menu,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/types.gen';
import { RequireAuth } from '@/components/auth/require-auth';
import { UserMenu } from './user-menu';
import { NotificationsSheet } from './notifications-sheet';
import { t, type MessageKey } from '@/lib/i18n';

type KycStatusDto = components['schemas']['KycStatusDto'];

export interface NavItem {
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'nav.wallet', href: '/wallet', icon: WalletIcon },
  { label: 'nav.transactions', href: '/transactions', icon: Receipt },
  { label: 'nav.accounts', href: '/accounts', icon: LineChart },
  { label: 'nav.partner', href: '/partner', icon: Handshake },
  { label: 'nav.platforms', href: '/platforms', icon: MonitorDown },
];

export function visibleNavItems(
  kycStatus: string | undefined,
  verificationLevel: number | undefined,
): NavItem[] {
  const kycDone = verificationLevel === 1 || kycStatus === 'approved';
  return kycDone
    ? NAV_ITEMS
    : [...NAV_ITEMS, { label: 'nav.kyc', href: '/kyc', icon: ShieldCheck }];
}

export function kycNavBadge(
  kycStatus: string | undefined,
  verificationLevel: number | undefined,
): { text: string; tone: 'warning' | 'info' | 'destructive' } | undefined {
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
  return (
    <RequireAuth>
      <PortalChrome>{children}</PortalChrome>
    </RequireAuth>
  );
}

function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const closeMobile = () => setMobileOpen(false);

  const { data: kycStatus = 'not_started' } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: async () => (await apiClient.get<KycStatusDto | null>('/kyc/status')).data ?? null,
    select: (dto) => dto?.status ?? 'not_started',
    enabled: user?.emailVerified === true,
    retry: false,
  });

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={`motion-slide fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card text-card-foreground transition-[width,transform] duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="flex items-center gap-3 overflow-hidden rounded-md focus-outline"
          >
            {/*
              A bare `<img>`, deliberately. The rule wants `next/image` for LCP
              and bandwidth, and neither applies to a static SVG served from
              `/public`: the optimizer does not rasterise or resize vectors, so
              it would add a request through `/_next/image` and return the same
              bytes. Same reasoning as the method logos in `money-shell.tsx`.
            */}
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

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!collapsed}
            className="hidden lg:flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={closeMobile}
            aria-label={t('nav.closeMenu')}
            className="flex lg:hidden h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {visibleNavItems(kycStatus, user?.verificationLevel).map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const badge =
              item.href === '/kyc'
                ? kycNavBadge(kycStatus, user?.verificationLevel)
                : item.badge
                  ? ({ text: String(item.badge), tone: 'warning' } as const)
                  : undefined;

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
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium focus-outline ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold'
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

        <UserMenu collapsed={collapsed} />
      </aside>

      <div
        className={`motion-slide flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md sm:h-16 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t('nav.openMenu')}
              aria-expanded={mobileOpen}
              className="flex lg:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <KycAlert kycStatus={kycStatus} verificationLevel={user?.verificationLevel} />
            <NotificationsSheet />

            <div className="lg:hidden">
              <UserMenu collapsed variant="header" />
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function KycAlert({
  kycStatus,
  verificationLevel,
}: {
  kycStatus: string | undefined;
  verificationLevel: number | undefined;
}) {
  const badge = kycNavBadge(kycStatus, verificationLevel);
  if (!badge) return null;

  const inReview = badge.tone === 'info';

  return (
    <Link
      href="/kyc"
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-outline ${
        badge.tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
          : inReview
            ? 'border-info/30 bg-info/10 text-info hover:bg-info/15'
            : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15'
      }`}
    >
      {inReview ? (
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{badge.text}</span>
      <span className="sr-only sm:hidden">{badge.text}</span>
    </Link>
  );
}
