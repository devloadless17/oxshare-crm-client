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
  // Aliased: `Wallet` is also the name of the generated wallet DTO across this
  // codebase, and one import shadowing the other in a file that grows to use
  // both is a confusing compile error at best.
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
  /** A message key, not a string — resolved through t() at render time. */
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  /** Route not built yet — rendered as a disabled "Soon" entry, never a link. */
  comingSoon?: boolean;
}

/**
 * The primary rail: the places a client goes to LOOK at something.
 *
 * `/wallet`, `/transactions` and `/accounts` are back with the money rebuild,
 * and `/deposit`, `/withdraw` and `/transfer` are deliberately NOT. Those three
 * are ACTIONS on a balance rather than destinations, and they live as
 * `MoneyAction` buttons on the wallet card, beside the number the client is
 * deciding against. Giving them permanent rail slots is the arrangement that
 * split one idea across three entries none of which showed a figure — and it
 * also put a live-looking link in front of clients the payments API refuses,
 * which is what `MoneyAction` exists to handle.
 *
 * `/profile` is in the account menu at the foot of the sidebar, where a client
 * would look for it. `/kyc` is conditional — see `visibleNavItems`.
 *
 * `/accounts` is `comingSoon`: the screen exists and is honest about waiting on
 * `GET /trading/accounts`, and the rail says the same thing rather than
 * offering a link that leads to a placeholder. That is the house pattern the
 * root CLAUDE.md records — unbuilt entries stay visible as disabled "Soon"
 * items, because they are committed scope.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  /*
   * The balance, and the only way into the three money actions.
   *
   * High in the rail because it is the screen a funded client opens most, and
   * because the deposit/withdraw/transfer controls hang off it — burying it
   * would bury them.
   */
  { label: 'nav.wallet', href: '/wallet', icon: WalletIcon },
  // What has happened to the money. A reading screen, so it is not behind the
  // KYC gate: a client whose approval lapsed still has every right to
  // enumerate their own history.
  { label: 'nav.transactions', href: '/transactions', icon: Receipt },
  { label: 'nav.accounts', href: '/accounts', icon: LineChart },
  /*
   * The partner programme. A destination, and permanent: unlike KYC it does not
   * disappear once dealt with, because an approved partner comes back to it for
   * their referral link. The page renders all five states behind this one href
   * — applied, pending, rejected, approved, not-yet-eligible — so the rail does
   * not need to know which.
   */
  { label: 'nav.partner', href: '/partner', icon: Handshake },
  /*
   * Where the client downloads the terminal, and the LAST entry on the rail.
   *
   * It sat above the partner programme, and it is here now because the rail is
   * ordered by how often a client returns to a destination. Downloading MT5 is
   * something they do once per device and then never again; the partner screen
   * is one an approved partner comes back to for their referral link and their
   * earnings. Ordering a nav by first-use rather than by recurring use puts the
   * least-revisited item in the most reachable slot.
   *
   * It is also the natural foot of the list for a second reason: it leads OFF
   * the portal. Every entry above it navigates within the app; this one hands
   * the client an installer.
   */
  { label: 'nav.platforms', href: '/platforms', icon: MonitorDown },
  // KYC is here but conditional — see `visibleNavItems`.
];

/**
 * The rail, minus what this particular client has no use for.
 *
 * Pure and exported so "does an approved client still see a KYC link" is one
 * assertion rather than something you find out by logging in as one.
 *
 * KYC is the only conditional entry, and it disappears rather than turning into
 * a tick: onboarding is a task, and a completed task is not a destination. An
 * approved client has nothing to do there — `saveStep` throws for an approved
 * submission — so the link led to a page whose only content was "you are done".
 */
export function visibleNavItems(
  kycStatus: string | undefined,
  verificationLevel: number | undefined,
): NavItem[] {
  const kycDone = verificationLevel === 1 || kycStatus === 'approved';
  return kycDone
    ? NAV_ITEMS
    : [...NAV_ITEMS, { label: 'nav.kyc', href: '/kyc', icon: ShieldCheck }];
}

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
 * action, and an approved client has no action.
 *
 * It is now the ONLY KYC indicator in the chrome. There used to be a second —
 * a pill in the header reading "Verified Account" / "KYC Under Review" /
 * "⚠️ KYC Action Required", the last of which was `animate-pulse` — and it has
 * been removed outright. A permanent "Verified Account" badge is a status
 * light that never changes: it tells an approved client something they cannot
 * act on, on every screen, forever. What remains is a badge that appears only
 * while there is work, on the entry that leads to the work, and disappears
 * with it.
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

/**
 * The signed-in shell, behind the gate rather than in front of it.
 *
 * Every private route in this app renders through here — dashboard, platforms,
 * profile and the non-wizard half of KYC — so this is the one place that gates
 * all of them without relying on the next person to remember. A new
 * `app/<thing>/layout.tsx` that reaches for `PortalLayout`, as every existing
 * one does, is authenticated by construction.
 *
 * The chrome itself is a separate component and stays UNGATED on purpose: it
 * only ever mounts once `RequireAuth` has a confirmed profile, which is what
 * lets it read `user` without a null-shaped fallback identity. It used to render
 * the literal name "Client User" and the avatar letter "U" for a null user —
 * placeholder identity for an unauthenticated visitor, on the customer-facing
 * app — and moving the gate outward is what makes that state unreachable rather
 * than merely unlikely.
 *
 * It also stops the `/kyc/status` query below from firing for a visitor who has
 * no session, which was a guaranteed 401 on every signed-out load.
 */
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
  // Sign-out, the theme switcher and the account identity all moved into
  // `UserMenu` at the foot of the sidebar, which is why none of that state
  // lives here any more.
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // The drawer closes where it is opened from — on the click that navigates.
  // Doing it in an effect keyed on `pathname` meant a second render pass after
  // every navigation just to flip a boolean.
  const closeMobile = () => setMobileOpen(false);

  /*
   * The sidebar badge follows the KYC status.
   *
   * NOT fetched until the email is verified. `/kyc/*` sits behind
   * `EmailVerifiedGuard`, so for an unverified client this request is a
   * guaranteed 403 — and while the pathname sat in the query key it fired again
   * on every single navigation. One client browsing the portal produced a steady
   * stream of `403 EMAIL_NOT_VERIFIED` in the server log, which is noise that
   * buries real authorization failures.
   *
   * `enabled` rather than swallowing the error: the request was never
   * meaningful, so the right fix is not to make it.
   */
  /*
   * `['kyc-status']` — the SAME key the wizard uses, and no pathname in it.
   *
   * This read `['kyc', 'status', pathname]`, which made two problems out of one
   * endpoint. The cache held a separate entry per URL, so the sidebar re-fetched
   * on every navigation and could disagree with `/kyc` about the same answer:
   * approve a submission and the wizard updated while the sidebar badge kept
   * yesterday's status until the client happened to visit a URL it had not
   * cached.
   *
   * The pathname was a remnant of the 403 flood described above — but the fix
   * for that was the `enabled` guard alone. Keying on the path did not stop the
   * request; it multiplied it.
   *
   * Sharing the key with `/kyc`, `/kyc/step/[step]` and `/kyc/submitted` also
   * means one invalidation updates all four.
   */
  /*
   * The cache holds the DTO; `select` narrows it to the badge's string.
   *
   * Storing the bare status here put a STRING under a key that `/kyc`,
   * `/kyc/submitted`, `/kyc/step/[step]` and the KYC layout all fill with the
   * DTO OBJECT — so the shared entry meant two different things depending on
   * which screen loaded first. See the longer note in `use-kyc-access.ts`.
   */
  const { data: kycStatus = 'not_started' } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: async () => (await apiClient.get<KycStatusDto | null>('/kyc/status')).data ?? null,
    select: (dto) => dto?.status ?? 'not_started',
    enabled: user?.emailVerified === true,
    retry: false,
  });

  return (
    /*
     * BOUNDED height, not a floor — `h-dvh`, not `min-h-screen`.
     *
     * `min-h-screen` sets a MINIMUM and lets content grow past it, so nothing
     * below it has a height to resolve against. Every `flex-1` down the tree
     * then falls back to content size, which is why `DataTable`'s `fill` mode —
     * the one that pins the column header and keeps the pager on screen —
     * silently reverted to growing here while working in admin. That is a layout
     * bug with no error message, which is why admin's own layout carries the
     * same note.
     *
     * `h-dvh` rather than admin's `h-screen`: `vh` on mobile Safari and Chrome
     * is the height with the URL bar HIDDEN, so a `100vh` app is permanently
     * taller than the visible viewport and the bottom of every screen sits under
     * the browser chrome. `dvh` tracks the bar as it collapses. This app is the
     * customer-facing one and is mostly read on a phone, so it takes the unit
     * admin's comment says it should have used.
     *
     * The cost, stated because it is a real change: `<main>` becomes the scroll
     * container instead of the window. Page-level scroll position, and anything
     * that reads `window.scrollY`, now belongs to that element.
     */
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      {/*
        `transition-[width,transform]`, not `transition-all`.

        Two properties actually move here: the WIDTH on desktop collapse, and
        the TRANSFORM on the mobile drawer. `transition-all` animated those and
        also every colour on the panel — so switching theme with the sidebar on
        screen faded the background over 300ms while the rest of the page
        changed instantly, and every hover inside it was competing with a
        300ms transition it did not ask for.

        `motion-slide` keeps the slide alive under `prefers-reduced-motion` —
        see the note in globals.css. Snapping between 16rem and 5rem does not
        read as the same panel getting narrower; it reads as a replacement.
      */}
      <aside
        className={`motion-slide fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border bg-card text-card-foreground transition-[width,transform] duration-300 ease-in-out ${
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
            /* Icon-only, so it needs a name: without one a screen reader
               announces "button" and the control that widens the whole
               navigation is unreachable to anyone not looking at it. */
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!collapsed}
            className="hidden lg:flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Mobile Close */}
          <button
            type="button"
            onClick={closeMobile}
            /* Icon-only, so it needs a name — the same reason the collapse
               button above carries one, and it matters more here: this is the
               only way out of the drawer on a phone, which is this portal's
               primary device. Without it a screen reader announces "button". */
            aria-label={t('nav.closeMenu')}
            // `press` is gone from the class list, not dropped by accident: the
            // utility no longer exists in globals.css, so keeping it would be a
            // class that resolves to nothing — which `npm run check:css` fails
            // on. Press feedback in this app is colour only.
            className="flex lg:hidden h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-outline"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {visibleNavItems(kycStatus, user?.verificationLevel).map((item) => {
            const Icon = item.icon;
            /*
             * Correct only while NAV_ITEMS stays flat.
             *
             * Each item tests itself in isolation, so two entries would both
             * match if one href were a prefix of another — which is exactly what
             * happened in the admin app, where `/kyc/builder` lit up both it and
             * `/kyc`. No portal nav entry is nested inside another today
             * (`/kyc/step/*` and `/kyc/submitted` are routes, not nav items, and
             * `/kyc` highlighting for them is right).
             *
             * Add a nested nav item and this needs admin-layout's
             * `activeNavHref`, which resolves the longest match across the whole
             * nav instead.
             */
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
                /*
                 * Which page you are on, said rather than only shown.
                 *
                 * Active state was carried entirely by colour and font weight,
                 * so a screen reader announced a row of identical links and
                 * anyone who cannot separate those colours got nothing either.
                 * The admin console had the same gap; both are fixed together
                 * because it is one mistake made twice, not two bugs.
                 */
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

        {/* Account menu — identity, profile, theme and sign-out, behind one
            trigger. The block that used to be here showed all of it at once,
            including a green "online" dot that measured nothing. */}
        <UserMenu collapsed={collapsed} />
      </aside>

      {/* Main Content Area */}
      <div
        /*
         * `min-w-0` is load-bearing, not tidiness.
         *
         * A flex item's default `min-width: auto` means it refuses to shrink
         * below its content — so one long unbreakable string anywhere inside
         * (an email address, a wallet reference, a device name) widens this
         * whole column past the viewport and the entire page scrolls sideways.
         * It also silently disables every `truncate` further down, because
         * truncation needs a bounded parent to truncate against.
         *
         * Found on /profile at 393px: the column measured 426px and the email
         * beneath the client's name measured 394px inside a 361px space, with
         * `truncate` applied and doing nothing.
         */
        /*
         * The content pane's left inset tracks the sidebar's width, so the two
         * must animate over the SAME duration and easing or the content visibly
         * lags behind the panel it is supposed to be attached to. Only
         * `padding` moves here — `transition-all` was also animating the
         * background on a theme switch.
         */
        className={`motion-slide flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-in-out ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md sm:h-16 lg:px-8">
          {/* Left Controls */}
          <div className="flex items-center gap-3">
            {/*
              Labelled, because its only content is an icon.
              A button whose child is an SVG has no accessible name at all: a
              screen reader announces "button", and on a phone — where this is
              the ONLY way to reach navigation — that leaves the whole portal
              unreachable. `aria-expanded` says which way it will go.
            */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t('nav.openMenu')}
              aria-expanded={mobileOpen}
              className="flex lg:hidden h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-outline"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/*
              The quick-search box was here, and it is gone rather than
              disabled. It was an `<input>` with no handler, no results surface
              and no endpoint behind it — its placeholder offered to search
              "accounts, deposits, trades... (⌘K)", a keyboard shortcut that was
              never bound, and typing into it did nothing at all. A control that
              accepts input and discards it is worse than no control: it is the
              only one on the page a client can be certain they used correctly.
            */}
          </div>

          {/*
            Right controls.

            The theme toggle used to live here — a two-button light/dark control
            with nowhere to put "System". It is a submenu in the account menu
            now, which is where a client looks for it.

            What replaced the notification bell is the interesting part. The
            bell was a dead control: no handler, no menu, and a permanent dot
            implying unread items that did not exist, on a product with no
            notifications table. A badge that always says "1" teaches people to
            ignore badges.

            In its place is the one alert this product can actually raise today,
            and it is raised from data the layout already has.

            The bell is back beside it — see `NotificationsSheet` for what it
            does and does not claim. What did not come back is the permanent
            unread dot.
          */}
          <div className="flex items-center gap-2 sm:gap-3">
            <KycAlert kycStatus={kycStatus} verificationLevel={user?.verificationLevel} />
            <NotificationsSheet />
            {/*
              The account menu, in the header, on mobile only.

              Below `lg` the sidebar is a drawer, so the menu at its foot is two
              interactions away — open the drawer, scroll to the bottom — for
              sign-out and the theme, which are the two things people reach for
              most on a phone. In the header it is one tap, and the avatar is
              also the only place the client sees their own photo on a small
              screen.

              `lg:hidden` because on desktop the sidebar footer already has it,
              and two account menus on one screen is a question about which is
              which.
            */}
            <div className="lg:hidden">
              <UserMenu collapsed variant="header" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        {/*
          `min-h-0` is the twin of `min-w-0` above and fails the same way.

          A flex item's default `min-height` is `auto`, which is its CONTENT —
          so without this `flex-1` cannot actually bound this element: a tall
          page pushes `<main>` past the viewport, `overflow-y-auto` finds
          nothing to overflow, and the whole document scrolls instead. That also
          takes the bound away from anything inside asking for `flex-1`, which
          is what `DataTable`'s `fill` mode needs.

          `flex flex-col` so a page can hand its own `flex-1` child the height —
          the transactions table is one.
        */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 md:p-6 lg:p-8">
          {children}
          {/*
            A SPACER, not more padding.

            `<main>` is the scroll container and already carries `p-*`, but a
            scroll container's BOTTOM padding is dropped once its content
            overflows — scroll to the end and the last card sits flush against
            the window edge. It is a long-standing browser behaviour rather than
            a mistake in the padding here, so adding more of it changes nothing.

            An empty element after the content cannot be collapsed away, so the
            gap survives the scroll. `shrink-0` because this lives in a flex
            column and would otherwise be the first thing squeezed to nothing.
          */}
          <div aria-hidden="true" className="h-4 shrink-0 sm:h-5 md:h-6 lg:h-8" />
        </main>
      </div>
    </div>
  );
}

/**
 * "Verification needed" in the header, and nothing at all once it is done.
 *
 * This is the notification slot, and it holds the only notification this
 * product can honestly raise: there is no notifications table, no endpoint and
 * nothing emitting events, so a bell with a permanent unread dot was inventing
 * a message it did not have.
 *
 * KYC is different — the status is already loaded by the layout for the sidebar
 * badge, it is genuinely actionable, and until it is done it blocks deposits,
 * withdrawals and the payments API entirely. That makes it worth a persistent
 * place in the chrome in a way "you have 1 unread" never was.
 *
 * It RENDERS NOTHING when there is no work. An empty slot is the honest state
 * for an approved client, and it is the same rule as `kycNavBadge` returning
 * undefined: a badge is a call to action, and someone with no action left needs
 * no badge. Both read the same two values, so the header and the sidebar cannot
 * disagree.
 *
 * A link rather than a button, because it navigates — middle-click, open in a
 * new tab and keyboard activation all come free and are all lost on a <button>
 * with an onClick that pushes a route.
 */
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
      {/* Under review is not a call to action, so it does not get the alarm
          icon — the client has already done their part and is waiting on us. */}
      {inReview ? (
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{badge.text}</span>
      {/* The label is hidden on a narrow viewport, so the icon needs a name of
          its own or the control becomes unlabelled exactly where it is hardest
          to guess from context. */}
      <span className="sr-only sm:hidden">{badge.text}</span>
    </Link>
  );
}
