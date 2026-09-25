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
 * The `comingSoon` branch is GONE. It rendered a disabled nav entry with a
 * "Soon" pill and had ZERO call sites — no item ever set the flag. The admin
 * app deleted its equivalent deliberately ("an operator reading the navigation
 * should be reading a list of places they can go, not a roadmap"); the portal
 * kept the machinery, so the rule lived in one app and the dead code in the
 * other. Restore it in the same commit that first needs it.
 */
export function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
  badge,
  nested = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  badge?: { text: string; tone: 'warning' | 'info' | 'destructive' };
  /** A sub-menu entry: indented, a size smaller, under its group. */
  nested?: boolean;
}) {
  const Icon = item.icon;
  /*
   * A SUB-MENU page is selected differently from a top-level one.
   *
   * The solid fill says "you are on this page" for the main sections. Used on
   * a child as well, the sidebar showed two heavy bars at once whenever the
   * group's parent was also marked — so a child is selected with a tint, its
   * label in full weight and its icon in the accent colour: the same "you are
   * here", one level down. (No edge bar — removed on request.)
   */
  const sub = nested && !collapsed;
  const tone = active
    ? sub
      ? 'bg-primary/10 text-foreground font-semibold'
      : 'bg-primary text-primary-foreground font-semibold'
    : 'text-muted-foreground hover:bg-accent hover:text-foreground';
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-outline ${
        sub ? 'py-2 ps-4 pe-3' : 'px-3 py-2.5'
      } ${tone} ${collapsed ? 'justify-center px-0' : ''}`}
    >
      <Icon
        className={`shrink-0 transition-colors duration-150 ${sub ? 'h-4 w-4' : 'h-5 w-5'} ${
          active
            ? sub
              ? 'text-link'
              : 'text-primary-foreground'
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
 * BUTTON with `aria-expanded`, not a link: the group is not a place, and a
 * parent that navigates on the same click that opens it takes the client
 * somewhere they did not choose.
 *
 * ## Collapsed rail
 *
 * An 80px rail has no room for an indented list and no hover-out menu a touch
 * screen could reach, so the group FLATTENS: its four pages become four icons,
 * each with its name as a tooltip. Nothing is behind a click the rail cannot show.
 */
export function NavGroup({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const children = item.children ?? [];
  const containsActive = children.some((child) => isActivePath(pathname, child.href));
  const [toggled, setToggled] = React.useState<boolean | null>(null);
  /*
   * Open when the client opened it, or — until they have touched it — when one
   * of its pages is the current one. Derived rather than synced in an effect,
   * so arriving on `/withdraw` renders the menu open on the first paint.
   */
  const open = toggled ?? containsActive;

  const panelId = 'nav-group-transactions';

  if (collapsed) {
    return (
      <div className="space-y-1.5 border-y border-border/60 py-1.5">
        {children.map((child) => (
          <NavLink
            key={child.href}
            item={child}
            active={isActivePath(pathname, child.href)}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        /*
         * Hover ALWAYS, and a selection of its own when one of its pages is
         * current: a tint and the section's name in full weight — lighter than
         * the page's own mark below it, so the eye reads "in Transactions, on
         * Withdraw" rather than two competing selections.
         */
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-outline ${
          containsActive
            ? 'bg-accent font-semibold text-foreground hover:bg-accent/80'
            : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <Icon
          className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
            containsActive ? 'text-link' : 'text-muted-foreground group-hover:text-link'
          }`}
        />
        <span className="flex-1 truncate text-start">{t(item.label)}</span>
        {/*
          `motion-slide`: this is STRUCTURAL motion — the menu opening — so it
          keeps its 300ms under "reduce motion", like the sidebar's own collapse
          (see globals.css). Without it the blanket reduced-motion rule makes
          the arrow and the list snap, which is what was reported.
        */}
        <ChevronDown
          className={`motion-slide h-4 w-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? 'rotate-180 text-foreground' : 'rotate-0'
          }`}
          aria-hidden="true"
        />
      </button>
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
                  active={isActivePath(pathname, child.href)}
                  collapsed={false}
                  onNavigate={onNavigate}
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
