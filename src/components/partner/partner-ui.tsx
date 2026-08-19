'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * The partner area's design system, rebuilt.
 *
 * ## The look this replaces, and why it changed
 *
 * The old screen was a set of separately floating cards, each with a tinted icon
 * chip in its header, two of them carrying blurred radial glows. Every panel was
 * decorated, so nothing was emphasised, and the decoration is what made a
 * money screen read as a consumer app rather than as a broker's back office.
 *
 * What is here instead is a STATEMENT language:
 *
 *  - Related figures share ONE surface and are separated by hairlines, rather
 *    than each floating in its own rounded box. A row of four cells divided by
 *    single-pixel rules reads as one table of facts; four cards read as four
 *    unrelated widgets.
 *  - No glows, no gradients, no tinted chrome. Colour appears on exactly three
 *    things: the primary action, the active tab, and a STATE (verified,
 *    suspended, reversed). A number is never coloured for decoration.
 *  - One type scale, used everywhere. Labels are 11px uppercase with wide
 *    tracking; figures are large, tight and `tabular-nums`; supporting text is
 *    12px muted. Three sizes, no exceptions, which is most of what makes a
 *    dense screen feel calm.
 *
 * ## The hairline grid
 *
 * `HAIRLINE_GRID` sets `gap-px` over a `bg-border` surface and each cell paints
 * `bg-card` on top, so the gaps ARE the rules. Done with borders instead, every
 * responsive breakpoint needs its own set of `border-e`/`border-b` overrides and
 * one of them is always wrong at one width. This version is correct at every
 * column count without knowing what the count is.
 */
export const HAIRLINE_GRID =
  'grid gap-px overflow-hidden rounded-2xl border border-border bg-border';

/** One cell of a `HAIRLINE_GRID`. Paints over the rule beneath it. */
export const CELL = 'bg-card';

/**
 * A table's height: ten rows, a header and a pager, whatever the table holds.
 *
 * Tables that size to their contents make the page jump as a partner moves
 * between tabs — one row here, forty there — and a two-row table is a card so
 * short it reads as a fragment of one. Every list here occupies the same shape.
 *
 * ## It works WITH `DataTable`'s `fill`, and needs it
 *
 * `fill` is what makes the table keep its frame — header, body, pager — and
 * gives its root `flex-1`, so the root resolves to exactly this frame's height.
 * A short table then sits inside a full-height card instead of a stubby one,
 * and the empty state centres in the same box.
 *
 * Without `fill` the root is document-flow and stretching it does nothing: the
 * card inside keeps its own content height and the extra space appears BELOW
 * the card, which is a gap rather than a table.
 *
 * ## The height is measured, not chosen — and getting it wrong is a SCROLLBAR
 *
 * `fill` makes the table's body its own scroll region, and `<main>` is already
 * the page's scroll container. So a body that overflows this frame by even one
 * row puts a second vertical scrollbar on the screen, inside the first.
 *
 * `DataTable`'s own metrics, at this app's type scale:
 *
 *   row      px-4 py-3.5   ~45px
 *   header   px-4 py-3     ~40px
 *   pager    px-4 py-2.5   ~44px, plus the root's `space-y-3` gap
 *
 * Ten rows is therefore 450 + 40 + 44 + 12 ≈ 546px. 32rem (512px) was SHORT by
 * about a row and produced exactly that second scrollbar the moment a table
 * filled its page; 36rem (576px) clears it with a margin for a wrapped cell.
 *
 * Change one of the three — this height, `TABLE_PAGE_SIZE`, or the table's
 * padding — and the other two have to be re-checked. (A partner who raises
 * "rows per page" themselves gets an inner scrollbar, which is their own choice
 * and reversible from the same control.)
 *
 * HORIZONTAL scrolling inside the frame is a different thing and is correct: a
 * six-column table on a narrow window has to scroll sideways somewhere, and the
 * alternative is clipping a column off the end.
 */
export const TABLE_FRAME = 'flex min-h-[36rem] min-w-0 flex-col';

/** Ten rows, matching `TABLE_FRAME`. Every list on this screen pages the same. */
export const TABLE_PAGE_SIZE = 10;

/** A plain panel. One radius, one border, no elevation, no tint. */
export function Surface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      /*
       * `shrink-0` is LOAD-BEARING rather than spacing, for the reason the
       * dashboard's `Panel` records: a panel is a flex child of a column that
       * fills the viewport, and a flex item's default is to shrink — so with
       * `overflow-hidden` a panel below the fold collapses to its own border and
       * reads as a horizontal line.
       */
      className={`flex shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card ${className ?? ''}`}
    >
      {children}
    </section>
  );
}

/**
 * The one header every panel uses.
 *
 * No icon. A glyph beside every title is a decoration repeated eight times down
 * a page, and by the eighth it carries no information — the title already says
 * what the panel is. Icons are kept for the places they do work: the tab strip,
 * where they aid recognition at a glance, and empty states, where they give a
 * short sentence something to sit under.
 */
export function SectionHeader({
  title,
  description,
  meta,
  action,
}: {
  title: string;
  /** One line under the title. Use it to state a boundary, not to repeat the title. */
  description?: string;
  /** A count or qualifier at the end of the row. */
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {meta && (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{meta}</span>
        )}
        {action}
      </div>
    </div>
  );
}

/**
 * One figure in a statement row.
 *
 * The label leads, the figure carries the weight, the hint qualifies it. `large`
 * is the only hierarchy — used on the single figure a partner opens the page
 * for — and it is a SIZE difference rather than a colour one, because a coloured
 * number on a money screen should mean something (a loss, a state) and this one
 * does not.
 *
 * The hint keeps its line when empty so a row of cells stays one height and does
 * not step up and down as data arrives.
 */
export function Stat({
  label,
  value,
  hint,
  large,
}: {
  label: string;
  value: string;
  hint?: string;
  large?: boolean;
}) {
  return (
    <div className={`${CELL} p-5`}>
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold tracking-tight break-all tabular-nums ${
          large ? 'text-3xl' : 'text-2xl'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 min-h-[1rem] text-xs text-muted-foreground">{hint ?? ''}</p>
    </div>
  );
}

/** The tones a pill may take. Named for meaning, not for colour. */
const TONES = {
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const;

export type Tone = keyof typeof TONES;

/**
 * A state, as a badge, and it is ALWAYS rendered — including when everything is
 * fine. A badge that only appears when something is wrong is one whose absence
 * a reader cannot trust.
 */
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * "Nothing here yet", centred in whatever frame it is given.
 *
 * Two sentences by design: what is not here, and what would put something here.
 * An empty state that only says "no data" leaves the reader with nothing to do —
 * and on a partner screen the second sentence is usually the whole product.
 */
export function EmptyPanel({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ElementType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {body && (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * Copy one short value, with the outcome ANNOUNCED rather than only shown.
 *
 * The failure path is the part worth having once: `navigator.clipboard` is
 * unavailable over plain HTTP and can be denied by permission, and a button that
 * appears to do nothing is the one control a user is certain they pressed
 * correctly.
 */
export function CopyButton({
  value,
  label,
  variant = 'outline',
}: {
  value: string;
  /** WHAT is being copied. "Copy" alone is ambiguous where two things are. */
  label: string;
  variant?: 'outline' | 'default' | 'ghost';
}) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={!value}
        onClick={() => void copy()}
        aria-label={`${t('partner.copy')} ${label}`}
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="sr-only sm:not-sr-only">
          {copied ? t('partner.copied') : t('partner.copy')}
        </span>
      </Button>
      <span role="status" className="sr-only">
        {copied ? t('partner.copied') : ''}
      </span>
      {failed && (
        <span role="alert" className="text-xs text-destructive">
          {t('partner.copyFailed')}
        </span>
      )}
    </>
  );
}

/**
 * A date in the reader's own locale.
 *
 * Guarded, because the value arrives as a string from the API and "Invalid Date"
 * on a partner's own approval line reads as a broken screen. Shared, because it
 * had been copied into four files.
 */
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/** The same, with the time — for a row that can appear twice in one day. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
