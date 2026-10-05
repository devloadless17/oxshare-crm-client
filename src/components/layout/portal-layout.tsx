'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  FileText,
  Handshake,
  LayoutDashboard,
  LineChart,
  MonitorDown,
  Receipt,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Menu,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useQuery } from '@tanstack/react-query';
import { externalLinksApi } from '@/lib/api/external-links';
import { RequireAuth } from '@/components/auth/require-auth';
import { UserMenu } from './user-menu';
import { isActivePath, NavGroup, NavLink, useNavSelection, type NavItem } from './sidebar-nav';
import { useRailPreference } from './use-rail-preference';
import { usePhoneDrawer } from './use-phone-drawer';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NotificationsSheet } from './notifications-sheet';
import { ExternalLinksSection } from './external-links-section';
import { KycAlert } from './kyc-alert';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { kycStatusQuery } from '@/lib/api/kyc';

export type { NavItem } from './sidebar-nav';

export const NAV_ITEMS: NavItem[] = [
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'nav.wallet', href: '/wallet', icon: WalletIcon },
  {
    label: 'nav.transactions',
    href: '#transactions',
    // Its NAME opens the Statement — the /transactions page it has always named.
    home: '/transactions',
    icon: Receipt,
    children: [
      { label: 'nav.deposit', href: '/deposit', icon: ArrowDownToLine },
      { label: 'nav.withdraw', href: '/withdraw', icon: ArrowUpFromLine },
      { label: 'nav.transfer', href: '/transfer', icon: ArrowLeftRight },
      { label: 'nav.statement', href: '/transactions', icon: FileText },
    ],
  },
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

export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <PortalChrome>{children}</PortalChrome>
    </RequireAuth>
  );
}

/** The sidebar's DOM id — the phone menu button names it in `aria-controls`. */
const SIDEBAR_ID = 'portal-sidebar';

function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, toggleRail] = useRailPreference();
  const asideRef = React.useRef<HTMLElement>(null);
  const { open: mobileOpen, show: openMobile, close: closeMobile } = usePhoneDrawer(asideRef);
  /*
   * The RAIL is a desktop state; the phone drawer is always the whole menu. A
   * client who collapsed the sidebar at a desk and later opens the menu on a
   * narrow window would otherwise get an 80px column of icons in a drawer.
   */
  const rail = collapsed && !mobileOpen;

  const { data: kycStatus = 'not_started' } = useQuery({
    queryKey: kycStatusQuery.queryKey,
    queryFn: ({ signal }) => kycStatusQuery.queryFn(signal),
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

  const navItems = visibleNavItems(kycStatus, user?.verificationLevel, partnerHidden);
  const selection = useNavSelection(navItems, pathname, rail);
  // A click on any page in the menu — even the one on screen — selects that page.
  const go = (href: string) => {
    selection.navigate(href);
    closeMobile();
  };

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
        ref={asideRef}
        id={SIDEBAR_ID}
        /* A dialog while it is the phone drawer — a modal over the page, which
           the overlay and the focus trap make it — and the page's sidebar the
           rest of the time. */
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? t('nav.menu') : undefined}
        className={`motion-slide fixed top-0 bottom-0 start-0 z-50 flex flex-col border-e border-border bg-card text-card-foreground duration-300 ease-in-out ${
          rail ? 'w-20' : 'w-64'
        } ${
          /*
           * As in the console: Tailwind v4 moves elements with the `translate`
           * PROPERTY, so a transition naming `transform` animated nothing and
           * the drawer snapped. `visibility` is transitioned on the way OUT
           * only — shut, the drawer is hidden, so its links leave the tab
           * order; opening, it is visible at once, so the trap's first focus()
           * is not refused. Logical sides mirror it for Arabic.
           */
          mobileOpen
            ? 'translate-x-0 transition-[width,translate]'
            : 'transition-[width,translate,visibility] max-lg:invisible max-lg:-translate-x-full max-lg:rtl:translate-x-full'
        }`}
      >
        {/*
          THE BRAND AREA — the logo fills the sidebar's width (the owner's
          request, 25 Sep 2026: bigger, "filling the whole width"). Twin in
          design of the admin console's, so both apps open on the same logo at
          the same size.

          At `h-10` the wordmark was 108px wide in a 256px column: it shared its
          row with the collapse chevron, and the 64px header capped its height.
          So the row is the logo's alone now —

          - the COLLAPSE control lives on the sidebar's edge in both states, the
            round button the collapsed rail already used (it was moved there
            once already, when the mark and a chevron jammed an 80px rail — the
            owner's report, 24 Sep 2026);
          - the wordmark is sized by WIDTH (`w-full`, capped at 200px), so it
            fills the column, its left edge lined up with the menu's icons;
          - the area is taller than the page header and carries no rule under
            it. A border at 96px beside the header's at 64px reads as two lines
            that missed each other; no border reads as the sidebar's own top.
        */}
        <div
          className={`relative flex h-16 shrink-0 items-center border-b border-border ${
            rail ? 'justify-center px-2' : 'justify-between gap-3 px-6'
          }`}
        >
          {/*
            NAMED ON THE LINK, for the reason its twin in the admin console
            carries: a control named only by a child image loses its name the
            moment the artwork is swapped, marked decorative, or hidden per
            theme — none of which look like an accessibility change. `aria-label`
            does not depend on which image is showing.

            The artwork is the brand's own vectors, drawn INLINE
            (brand-logo.tsx): no file request, official colours, and the link
            carries the accessible name, so the drawing is decorative.
          */}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            aria-label={t('app.name')}
            className={`flex items-center rounded-md focus-outline ${rail ? '' : 'min-w-0 flex-1'}`}
          >
            {rail ? (
              <BrandLogo variant="mark" className="shrink-0" />
            ) : (
              <BrandLogo className="shrink-0" />
            )}
          </Link>

          {/* On the sidebar's EDGE in both states, so the row is the logo's. */}
          <button
            type="button"
            onClick={toggleRail}
            aria-label={rail ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!rail}
            className="absolute -end-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-outline lg:flex"
          >
            {rail ? (
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={closeMobile}
            aria-label={t('nav.closeMenu')}
            className="flex lg:hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {navItems.map((item) =>
            item.children ? (
              <NavGroup
                key={item.href}
                item={item}
                page={selection.page}
                collapsed={rail}
                open={selection.openGroup === item.href}
                selected={selection.selectedGroup === item.href}
                onToggle={() => selection.toggle(item.href)}
                onNavigate={go}
              />
            ) : (
              <NavLink
                key={item.href}
                item={item}
                current={isActivePath(selection.page, item.href)}
                selected={
                  isActivePath(selection.page, item.href) && selection.selectedGroup === null
                }
                collapsed={rail}
                onNavigate={() => go(item.href)}
                badge={
                  item.href === '/kyc'
                    ? kycNavBadge(kycStatus, user?.verificationLevel)
                    : item.badge
                      ? ({ text: String(item.badge), tone: 'warning' } as const)
                      : undefined
                }
              />
            ),
          )}

          <ExternalLinksSection links={externalLinks} collapsed={rail} onNavigate={closeMobile} />
        </nav>
      </aside>

      <div
        className={`motion-slide flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out ${
          collapsed ? 'lg:ps-20' : 'lg:ps-64'
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md sm:h-16 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openMobile}
              aria-label={t('nav.openMenu')}
              aria-expanded={mobileOpen}
              aria-controls={SIDEBAR_ID}
              className="flex lg:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <KycAlert badge={kycNavBadge(kycStatus, user?.verificationLevel)} />
            {/*
              Light or dark, one click, BESIDE the bell — the client's call. It
              used to be a Theme ▸ submenu inside the account menu offering
              System as well; the toggle is the whole control now.
            */}
            <LanguageSwitcher />
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
          <div className="flex flex-1 flex-col p-4 sm:p-5 md:p-6 lg:p-8">
            {children}
            {/* Room for the assistant's button, so a page's last line can scroll above it (0 when it is not shown). */}
            <div aria-hidden className="h-[var(--assistant-room,0px)] shrink-0" />
          </div>
        </main>
      </div>
    </div>
  );
}
