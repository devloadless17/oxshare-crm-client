'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ExternalLink } from '@/lib/api/external-links';
import { localized, t } from '@/lib/i18n';

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
export function ExternalLinksSection({
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

      {links.map((raw) => {
        // The operator's title and description in the reader's language (0179).
        const link = {
          ...raw,
          title: localized(raw.title, raw.titleAr),
          description: raw.description ? localized(raw.description, raw.descriptionAr) : null,
        };
        return (
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
            // The menu's NEUTRAL hover (see sidebar-nav.tsx) — a brand-tinted
            // hover reads as a second selected row.
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-outline ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <ArrowUpRight
              className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground rtl:-scale-x-100"
              aria-hidden="true"
            />
            {!collapsed && <span className="flex-1 truncate">{link.title}</span>}
          </a>
        );
      })}
    </>
  );
}
