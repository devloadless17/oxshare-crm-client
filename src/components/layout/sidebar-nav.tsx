'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { t, type MessageKey } from '@/lib/i18n';

export interface NavItem {
  label: MessageKey;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  /**
   * A GROUP: the entry opens and closes a sub-menu instead of navigating, and
   * `href` is only its identity. Transactions is the one group — Deposit,
   * Withdraw and Transfer are each a page of their own, and Statement is the
   * route the whole section used to be.
   */
  children?: NavItem[];
  /**
   * A group's main page — where its NAME goes (the arrow beside it only opens
   * the list). Absent: its first page.
   */
  home?: string;
}

const BADGE_TONES: Record<'warning' | 'info' | 'destructive', string> = {
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/15 text-info',
  destructive: 'bg-destructive/15 text-destructive',
};

export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(href + '/');
}

/*
 * ONE look for "selected", wherever it appears — twin in design of the admin
 * console's sidebar. The Dashboard used to be a SOLID fill while the group
 * holding a page was a tint, so the two read as different states (the owner's
 * report, on the console); hover is NEUTRAL, because a hovered row painted in
 * the selection's colour read as a second selected item.
 */
const SELECTED_ROW = 'bg-primary/10 font-semibold text-foreground';
const IDLE_ROW = 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground';
const SELECTED_ICON = 'text-link';
const IDLE_ICON = 'text-muted-foreground group-hover:text-foreground';

/**
 * Where the menu stands — twin in design of the console's `MenuPosition`
 * (oxshare-crm-admin `sidebar-nav.tsx`, which carries the full story).
 *
 * - It shows where the client is GOING, from the click. `pathname` changes only
 *   when the new page lands, and a menu that waited for it fell back to the
 *   page being left for that whole window: the group you clicked in folded
 *   shut and opened again (reported on the console). Recorded from
 *   `next/link`'s `onNavigate`, never `onClick`, so a click that opens a new
 *   tab leaves this tab's menu alone. A second click before the first page
 *   lands overtakes it; if the router still shows the overtaken page on the
 *   way, the menu keeps showing the latest click rather than flicking back.
 * - A choice lasts until the client goes somewhere: any navigation clears it,
 *   so one made two pages ago never comes back — except a group opened while
 *   a click's page was on its way, which is a choice about the page that
 *   arrives.
 */
interface MenuPosition {
  /** The `pathname` this position was last reconciled with. */
  path: string | null;
  /** The page a click in this menu is taking the client to, until it lands. */
  heading?: string;
  /** Pages of earlier clicks that `heading` overtook, oldest first — they may still land. */
  overtaken?: readonly string[];
  /** The group the client opened; `null` closed it; absent follows the page. */
  open?: string | null;
}

/**
 * Which page the menu shows, which group is OPEN, and which row is the
 * sidebar's one SELECTED row.
 *
 * The open group is derived, never synced in an effect: the choice the client
 * made, else the group holding the page — so arriving on `/withdraw` from a
 * notification renders Transactions open on the first paint.
 *
 * The selected row follows the same choice. It used to follow the PAGE alone,
 * so on the dashboard, opening Transactions left Dashboard filled — "the old
 * item keeps showing as active" (reported on the console, which shares the
 * rule). The page stays `aria-current` throughout.
 *
 * The collapsed rail has nothing to open, so it selects by the page alone.
 */
export function useNavSelection(items: NavItem[], pathname: string | null, collapsed: boolean) {
  const [position, setPosition] = React.useState<MenuPosition>({ path: pathname });
  let here = position;
  if (position.path !== pathname) {
    // Adjusted while rendering, so a stale position is never painted.
    const echo = pathname === null ? -1 : (position.overtaken?.indexOf(pathname) ?? -1);
    here =
      position.heading !== undefined && position.heading === pathname
        ? { path: pathname, open: position.open }
        : echo >= 0
          ? { ...position, path: pathname, overtaken: position.overtaken?.slice(echo + 1) }
          : { path: pathname };
    setPosition(here);
  }
  /* The page the menu shows: where a click in it is going, else the page on screen. */
  const page = here.heading ?? pathname;
  const activeGroup =
    items.find((item) => item.children?.some((child) => isActivePath(page, child.href)))?.href ??
    null;
  const openGroup = here.open === undefined ? activeGroup : here.open;
  const selectedGroup = collapsed ? activeGroup : (here.open ?? activeGroup);
  const toggle = (href: string) => setPosition({ ...here, open: openGroup === href ? null : href });
  /** A click in the menu is taking the client to `href` — even the page on screen. */
  const navigate = (href: string) =>
    setPosition({
      path: here.path,
      heading: href,
      overtaken:
        here.heading !== undefined && here.heading !== href
          ? [...(here.overtaken ?? []), here.heading]
          : here.overtaken,
    });
  return { page, openGroup, selectedGroup, toggle, navigate };
}

/*
 * The `comingSoon` branch is GONE. It rendered a disabled nav entry with a
 * "Soon" pill and had ZERO call sites — no item ever set the flag. The admin
 * app deleted its equivalent deliberately ("an operator reading the navigation
 * should be reading a list of places they can go, not a roadmap"); the portal
 * kept the machinery, so the rule lived in one app and the dead code in the
 * other. Restore it in the same commit that first needs it.
 */
export function NavLink({
  item,
  current,
  selected = false,
  collapsed,
  onNavigate,
  badge,
  nested = false,
}: {
  item: NavItem;
  /**
   * This link IS the page — the one on screen, or the one a click in the menu
   * is taking the client to — so `aria-current`, whatever is selected.
   */
  current: boolean;
  /** This top-level row is the sidebar's one selected row. */
  selected?: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badge?: { text: string; tone: 'warning' | 'info' | 'destructive' };
  /** A sub-menu entry: indented, a size smaller, under its group. */
  nested?: boolean;
}) {
  const Icon = item.icon;
  /*
   * A SUB-MENU page is marked, not filled.
   *
   * The group above it carries the fill, so the current child is its label in
   * full weight and the brand colour — "in Transactions, on Withdraw": one
   * selection and a place within it, not two selections. (No edge bar —
   * removed on request.)
   */
  const sub = nested && !collapsed;
  const marked = sub ? current : selected;
  const tone = sub
    ? current
      ? 'font-semibold text-link hover:bg-muted'
      : IDLE_ROW
    : selected
      ? SELECTED_ROW
      : IDLE_ROW;
  return (
    <Link
      href={item.href}
      /* Not `onClick` — see `MenuPosition`: a click that opens a new tab is not a navigation here. */
      onNavigate={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      aria-current={current ? 'page' : undefined}
      data-selected={!sub && selected ? 'true' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg text-sm transition-colors duration-150 focus-outline ${
        sub ? 'py-2 ps-4 pe-3' : 'px-3 py-2.5'
      } ${tone} ${collapsed ? 'justify-center px-0' : ''}`}
    >
      <Icon
        className={`shrink-0 transition-colors duration-150 ${sub ? 'h-4 w-4' : 'h-5 w-5'} ${
          marked ? SELECTED_ICON : IDLE_ICON
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
}

/**
 * An entry that opens a sub-menu — Transactions → Deposit, Withdraw, Transfer,
 * Statement.
 *
 * ## Open state
 *
 * OPEN whenever one of its pages is the current one, so a client who lands on
 * `/withdraw` from a notification sees where they are in the menu without
 * having to find it. Otherwise it is the client's toggle. The toggle is a
 * BUTTON with `aria-expanded` — the arrow — and it only opens or closes.
 *
 * ## Name and arrow — twin of the console (owner's call, 25 Sep 2026)
 *
 * The NAME is a link to the group's main page (`home`: Transactions opens the
 * Statement, which is the /transactions page the name already names), and
 * arriving there opens the list because the list follows the page. The arrow
 * lets a client look inside without leaving the page on screen. The row is one
 * selectable surface (`data-selected`), so it reads as one item.
 *
 * ## Collapsed rail
 *
 * An 80px rail has no room for an indented list and no hover-out menu a touch
 * screen could reach, so the group FLATTENS: its four pages become four icons,
 * each with its name as a tooltip. Nothing is behind a click the rail cannot show.
 */
export function NavGroup({
  item,
  page,
  collapsed,
  open,
  selected,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  /** The page the menu shows — `useNavSelection().page`. */
  page: string | null;
  collapsed: boolean;
  /** From `useNavSelection` — the open group is decided for the whole menu. */
  open: boolean;
  /** This group is the sidebar's one selected row. */
  selected: boolean;
  onToggle: () => void;
  onNavigate: (href: string) => void;
}) {
  const children = item.children ?? [];
  const panelId = `nav-group-${item.href.replace(/[^a-z0-9]+/gi, '')}`;

  if (collapsed) {
    return (
      <div className="space-y-1.5 border-y border-border/60 py-1.5">
        {children.map((child) => (
          <NavLink
            key={child.href}
            item={child}
            // On the rail each page is its own row, so the page IS the selection.
            current={isActivePath(page, child.href)}
            selected={isActivePath(page, child.href)}
            collapsed
            onNavigate={() => onNavigate(child.href)}
          />
        ))}
      </div>
    );
  }

  const Icon = item.icon;
  const label = t(item.label);
  const home = item.home ?? children[0]?.href;
  return (
    <div>
      <div
        data-selected={selected ? 'true' : undefined}
        className={`group flex items-center rounded-lg text-sm transition-colors duration-150 ${
          selected ? SELECTED_ROW : IDLE_ROW
        }`}
      >
        {home ? (
          <Link
            href={home}
            onNavigate={() => onNavigate(home)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 ps-3 pe-1 focus-outline"
          >
            <Icon
              className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
                selected ? SELECTED_ICON : IDLE_ICON
              }`}
            />
            <span className="flex-1 truncate text-start">{label}</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t('nav.groupPages', { group: label })}
          className="me-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-foreground/10 focus-outline"
        >
          {/*
            `motion-slide`: this is STRUCTURAL motion — the menu opening — so it
            keeps its 300ms under "reduce motion", like the sidebar's own
            collapse (see globals.css). Without it the blanket reduced-motion
            rule makes the arrow and the list snap, which is what was reported.
          */}
          <ChevronDown
            className={`motion-slide h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              open ? 'rotate-180 text-foreground' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>
      {/*
        ALWAYS MOUNTED, animated by its row height.

        Mounting on open made it snap: there is nothing to transition FROM when
        the element did not exist a frame ago. A grid whose one row goes from
        `0fr` to `1fr` animates to the content's real height without measuring
        it, and the inner `overflow-hidden` keeps the rows from showing while it
        grows. Each entry then slides and fades in a beat after the one above,
        so the list unfolds rather than appearing — same curve as the arrow.

        `inert` while closed: collapsed to zero height the links are still in
        the tab order, and a keyboard user would tab into four invisible links.
      */}
      <div
        id={panelId}
        inert={!open}
        className={`motion-slide grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* The guide line that ties the sub-pages to their section. */}
          <div className="relative ms-5 mt-1 space-y-0.5 border-s border-border ps-2">
            {children.map((child, index) => (
              <div
                key={child.href}
                className={`motion-slide transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                }`}
                // Opening staggers top to bottom; closing folds together.
                style={{ transitionDelay: open ? `${60 + index * 40}ms` : '0ms' }}
              >
                <NavLink
                  item={child}
                  current={isActivePath(page, child.href)}
                  collapsed={false}
                  onNavigate={() => onNavigate(child.href)}
                  nested
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
