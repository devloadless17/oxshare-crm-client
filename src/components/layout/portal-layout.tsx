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
  ArrowUpRight,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { externalLinksApi, type ExternalLink } from '@/lib/api/external-links';
import type { components } from '@/lib/api/types.gen';
import { RequireAuth } from '@/components/auth/require-auth';
import { UserMenu } from './user-menu';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsSheet } from './notifications-sheet';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

type KycStatusDto = components['schemas']['KycStatusDto'];

export interface NavItem {
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
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
  /**
   * From `usePartnerAccess().hidden` — true only for a client the ladder can
   * never hold (`chain_full`, no account, no application). Their Partner entry
   * is a door that cannot open, so it is REMOVED rather than badged: a visible
   * item that always ends in "you cannot" is navigation to a refusal.
   * `RequireAuth` bounces the typed URL for the same client, so hiding the
   * link does not strand anyone somewhere they could otherwise go.
   */
  partnerHidden = false,
): NavItem[] {
  const kycDone = (verificationLevel ?? 0) >= 1 || kycStatus === 'approved';
  const items = partnerHidden ? NAV_ITEMS.filter((item) => item.href !== '/partner') : NAV_ITEMS;
  return kycDone ? items : [...items, { label: 'nav.kyc', href: '/kyc', icon: ShieldCheck }];
}

export function kycNavBadge(
  kycStatus: string | undefined,
  verificationLevel: number | undefined,
): { text: string; tone: 'warning' | 'info' | 'destructive' } | undefined {
  if ((verificationLevel ?? 0) >= 1 || kycStatus === 'approved') return undefined;
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
    queryKey: keys.kyc.status(),
    queryFn: async () => (await apiClient.get<KycStatusDto | null>('/kyc/status')).data ?? null,
    select: (dto) => dto?.status ?? 'not_started',
    enabled: user?.emailVerified === true,
    retry: false,
  });

  /*
   * Whether the Partner entry is drawn at all — hidden for a client whose
   * introducer is on the deepest enabled level (`chain_full`): the ladder has
   * no rung for them, so the page is a door that can never open. Shares the
   * partner page's own `/ib/status` query key, so this costs no extra request
   * on the screen that needs the answer most — and while the answer is in
   * flight the entry stays, because hiding on an unanswered question is the
   * mistake `RequireAuth` documents twice.
   */
  const { hidden: partnerHidden } = usePartnerAccess();

  /*
   * The broker's own links, drawn under the app's pages.
   *
   * `useQuery` directly rather than `useResource`, matching the KYC badge above
   * and for the same reason: the 4-state Resource exists so a SCREEN can tell
   * loading from unavailable from error and render each differently. None of
   * those have a rendering in a sidebar. A menu that has not loaded yet shows
   * the app's own pages and nothing else, which is exactly what `[]` already
   * means to the section below — so every failure state collapses to "no extra
   * section" rather than putting a spinner or a retry card in the chrome of
   * every page.
   *
   * `staleTime` is generous because this is operator content that changes a few
   * times a year, and it is fetched on every page the client opens. `retry:
   * false` for the same reason the KYC query sets it: a link menu is not worth
   * a backoff storm, and the next navigation asks again.
   */
  const { data: externalLinks = [] } = useQuery({
    queryKey: keys.externalLinks.all(),
    queryFn: ({ signal }) => externalLinksApi.list(signal),
    staleTime: 5 * 60 * 1000,
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
          {/*
            NAMED ON THE LINK, for the reason its twin in the admin console
            carries: a control named only by a child image loses its name the
            moment the artwork is swapped, marked decorative, or hidden per
            theme — none of which look like an accessibility change. `aria-label`
            does not depend on which image is showing.
          */}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            aria-label={t('app.name')}
            className="flex items-center gap-3 overflow-hidden rounded-md focus-outline"
          >
            {/*
              A bare `<img>`, deliberately. The rule wants `next/image` for LCP
              and bandwidth, and neither applies to a static SVG served from
              `/public`: the optimizer does not rasterise or resize vectors, so
              it would add a request through `/_next/image` and return the same
              bytes. Same reasoning as the method logos in `money-shell.tsx`.
            */}
            {/*
              THE REAL WORDMARK when there is room, the mark alone when there is
              not — rather than the mark beside the brand name set in the UI
              font. The letterforms in the supplied artwork are drawn, not
              typeset, so rendering "OXShare" in Geist was always an
              approximation of the logo sitting next to the logo.

              Both files are the brand's own vector artwork, extracted from the
              supplied PDF rather than redrawn, so they scale to any height
              without the hand-traced circles the previous mark used.
            */}
            {/*
              Drawn INLINE (brand-logo.tsx): no file request, no second copy
              swapped by CSS, official colours. The link carries the accessible
              name, so the drawing is decorative.
            */}
            {collapsed ? (
              <BrandLogo variant="mark" className="h-7 w-auto shrink-0" />
            ) : (
              <BrandLogo className="h-7 w-auto shrink-0" />
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
          {visibleNavItems(kycStatus, user?.verificationLevel, partnerHidden).map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            const badge =
              item.href === '/kyc'
                ? kycNavBadge(kycStatus, user?.verificationLevel)
                : item.badge
                  ? ({ text: String(item.badge), tone: 'warning' } as const)
                  : undefined;

            /*
             * The `comingSoon` branch is GONE. It rendered a disabled nav
             * entry with a "Soon" pill and had ZERO call sites — no item ever
             * set the flag. The admin app deleted its equivalent deliberately
             * ("an operator reading the navigation should be reading a list of
             * places they can go, not a roadmap"); the portal kept the
             * machinery, so the rule lived in one app and the dead code in the
             * other. Restore it in the same commit that first needs it.
             */

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

          <ExternalLinksSection
            links={externalLinks}
            collapsed={collapsed}
            onNavigate={closeMobile}
          />
        </nav>
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
            {/*
              Light or dark, one click, BESIDE the bell — the client's call. It
              used to be a Theme ▸ submenu inside the account menu offering
              System as well; the toggle is the whole control now.
            */}
            <ThemeToggle />
            <NotificationsSheet />

            {/*
              The account menu lives HERE, at every breakpoint — the top-right
              placement the product owner asked for. It used to sit at the foot
              of the sidebar on desktop with this header copy gated `lg:hidden`;
              one menu in one place means one selector for the tests and no
              duplicate trigger for a screen reader to announce twice. The
              trigger shows the client's name from `md` up and collapses to the
              avatar below it, so the 56px mobile header keeps today's width.
            */}
            <UserMenu collapsed variant="header" />
          </div>
        </header>
        {/*
          `<main>` scrolls; the div inside it carries the page padding.

          ── The bug: NO BOTTOM PADDING on any page that overflows ─────────────

          That inner div was `flex-1 min-h-0`, and `min-h-0` is what broke it.

          A flex item's default `min-height: auto` is a FLOOR at its content
          height — it is what stops an item shrinking smaller than what is inside
          it. `min-h-0` removes that floor. Combined with `flex-1` (basis 0,
          grow, shrink) inside a container of fixed height, the div computed to
          exactly `<main>`'s height no matter how tall its content was.

          Padding is drawn on the div's OWN box. So on a short page everything
          looked right, and on a page taller than the viewport the content
          overflowed the div's bottom edge — and the padding stayed up at that
          edge, above the overflow. Scrolling to the end put the last row flush
          against the window with the padding stranded somewhere in the middle.

          ── The fix, and why `flex-1` alone is right ─────────────────────────

          Dropping `min-h-0` restores `min-height: auto`, which makes the div
          `max(content height, available height)`:

            · short page  — `flex-1` grows it to fill `<main>`, as before.
            · tall page   — the content floor wins, the div grows past `<main>`,
                            `<main>` scrolls, and the bottom padding is at the
                            bottom of the CONTENT where it belongs.

          `min-h-full` would also have worked, but it resolves a percentage
          against a flex parent and needs `<main>` to keep a definite height.
          This does the same job with one class removed and no percentage.

          ── Why this does NOT break the `fill` screens ───────────────────────

          /transactions and /accounts put `flex-1 min-h-0` on their own root so
          the table becomes the scroll container and the pager stays put. Such a
          child has `flex-basis: 0` and its own `min-height: 0`, so it
          contributes ZERO to this div's content height — the automatic floor is
          0, the div is still exactly `<main>`'s height, and the table still
          scrolls inside itself. The floor only bites for content that actually
          has intrinsic height, which is precisely the case that was broken.
        */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-1 flex-col p-4 sm:p-5 md:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * The broker's own links, under the app's pages.
 *
 * ## It renders NOTHING when there are none
 *
 * Not an empty heading, not a "no links yet" line. The two other states this
 * could be in — still loading, and the request failed — collapse to the same
 * empty array by design (see the query in `PortalChrome`), and all three mean
 * the same thing to a client: the sidebar is the app's own pages. A heading
 * over nothing would be the only one of the three that looked broken.
 *
 * ## Why an `<a>` and not a `<Link>`
 *
 * These leave the portal, so there is nothing for the router to prefetch or
 * intercept. `target="_blank"` keeps the client's session and any half-finished
 * form on the page they were on — a broker link is a reference, not a
 * destination — and `rel="noopener noreferrer"` is what makes that safe: without
 * `noopener` the opened page gets a handle on this window through
 * `window.opener` and can navigate it somewhere of its choosing, which is a
 * phishing primitive aimed at a signed-in trading portal.
 *
 * The URL itself is never constructed or corrected here. The API refuses
 * anything that is not http(s) — an operator-set value becoming an `href` in
 * every client's browser is why `javascript:` there would be stored XSS — and
 * this component adds no opinion of its own on top of that.
 */
function ExternalLinksSection({
  links,
  collapsed,
  onNavigate,
}: {
  links: ExternalLink[];
  collapsed: boolean;
  onNavigate: () => void;
}) {
  if (links.length === 0) return null;

  return (
    <>
      {/*
        A separator, and a heading only when there is room for one. Collapsed,
        the rail is icons — a truncated word above them says less than the rule
        does, and the per-item arrow still marks these as leaving the portal.
      */}
      <div className="!mt-4 border-t border-border pt-4">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            {t('nav.section.resources')}
          </p>
        )}
      </div>

      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          /*
           * The DESCRIPTION is the tooltip when there is one, because that is
           * the thing the operator wrote to explain the link. Collapsed with no
           * description, the title is all there is to identify the icon by.
           */
          title={link.description ?? (collapsed ? link.title : undefined)}
          aria-label={t('nav.opensInNewTab', { title: link.title })}
          className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-outline ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <ArrowUpRight
            className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-link"
            aria-hidden="true"
          />
          {!collapsed && <span className="flex-1 truncate">{link.title}</span>}
        </a>
      ))}
    </>
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
