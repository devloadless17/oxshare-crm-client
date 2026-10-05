'use client';

import { ArrowUpRight, Globe } from 'lucide-react';
import type { AssistantSource } from '@/lib/api/assistant';
import { sourceHost } from '@/lib/assistant/citations';
import { t } from '@/lib/i18n';

/** A few sites, not a bibliography: enough to check the answer at a glance. */
const SHOWN = 5;

/**
 * The web pages an answer drew on, as small chips under it: the site's name,
 * the page title on hover, and the page in a new tab. One chip per site.
 *
 * External links live HERE and nowhere else in an answer: the Markdown renderer
 * still links only to portal pages. These URLs are the pages OpenAI's search
 * actually read (its citations), never a link the model typed into its text.
 * `noopener noreferrer` keeps the portal and its URL out of the opened page.
 */
export function MessageSources({ sources }: { sources: AssistantSource[] }) {
  const bySite = new Map<string, AssistantSource>();
  for (const source of sources) {
    const host = sourceHost(source.url);
    if (!bySite.has(host)) bySite.set(host, source);
  }
  if (bySite.size === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Globe aria-hidden className="h-3 w-3" />
        {t('assistant.sources')}
      </span>
      {[...bySite].slice(0, SHOWN).map(([host, source]) => (
        <a
          key={host}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={source.title}
          dir="ltr"
          className="inline-flex max-w-[12rem] items-center gap-0.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">{host}</span>
          <ArrowUpRight aria-hidden className="h-3 w-3 shrink-0" />
        </a>
      ))}
    </div>
  );
}
