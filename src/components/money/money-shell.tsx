'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Wallet2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { assetUrl } from '@/lib/asset-url';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

/**
 * The shared furniture of /deposit, /withdraw and /transfer.
 *
 * ## Why these three share a shell at all
 *
 * They are the same task three times — pick a thing, name an amount, confirm —
 * and they had drifted into three different shapes with three different step
 * treatments and three different ways of showing an error. A client who has
 * learned to deposit should not have to re-learn the page to withdraw.
 *
 * What is NOT shared is the substance: each screen's rules, refusals and copy
 * are its own, because a withdrawal is not a deposit with a different verb.
 */

/**
 * A numbered progress rail, and the HEADER OF THE CARD on every money flow.
 *
 * `aria-current="step"` rather than colour alone: the active step is otherwise
 * announced identically to every other, and this is a money flow where knowing
 * whether you have already committed matters.
 *
 * ## The border and padding belong HERE, not at the call site
 *
 * Each screen used to wrap this in its own bordered div, so deposit, withdraw
 * and transfer drifted apart at the one element they all start with — different
 * padding on each, and one of them a different component entirely. Owning the
 * chrome means the three cards begin identically by construction rather than by
 * three files agreeing to.
 */
export function StepRail({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol className="flex w-full items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
      {steps.map((label, index) => {
        const done = index < active;
        const current = index === active;
        const last = index === steps.length - 1;
        return (
          /*
           * `flex-1` on every step EXCEPT the last.
           *
           * With it everywhere, the three shared the width equally and the final
           * step's circle sat left-aligned inside its own third — so the rail
           * stopped a third of the way short of the card's right edge and read
           * as a header that had failed to stretch.
           *
           * Only the steps that CARRY A CONNECTOR need to grow: the connector is
           * what absorbs the slack, and the last step has none, so it shrinks to
           * its content and lands flush against the right edge.
           */
          <li key={label} className={cn('flex items-center gap-2', !last && 'flex-1')}>
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors',
                done && 'border-success bg-success text-success-foreground',
                current && 'border-primary bg-primary text-primary-foreground',
                !done && !current && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden truncate text-xs font-medium sm:inline',
                current ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {/* The connector, decorative — the numbers already carry the order. */}
            {!last && (
              <span
                aria-hidden="true"
                className={cn('h-px flex-1 rounded', done ? 'bg-success' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A page heading with a way back.
 *
 * `title` and `subtitle` are OPTIONAL, and omitting them leaves the back link
 * alone. /withdraw does exactly that: its card carries a step rail naming both
 * steps, so an `<h1>` reading "Withdraw" above a rail whose first step is
 * "Method" was the third thing on screen saying where the client already knew
 * they were. Dropping the heading is not the same as dropping the way back —
 * they lived in one component, which is why this takes a prop rather than the
 * page rendering its own `<Link>` and drifting from the other two screens.
 */
export function MoneyHeader({
  title,
  subtitle,
  backHref = '/wallet',
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
}) {
  return (
    <div className={cn(title || subtitle ? 'space-y-3' : undefined)}>
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link href={backHref}>
          {/* Mirrored under RTL rather than swapped: "back" points at the start
              of the line, which is the RIGHT in Arabic. */}
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('nav.wallet')}
        </Link>
      </Button>
      {(title || subtitle) && (
        <div>
          {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * THE card. One per screen, holding the whole task.
 *
 * Deposit, withdraw and transfer each ask three questions and then take an
 * action, and they used to answer that with three or four separate bordered
 * panels stacked down the page — which read as three or four separate jobs, and
 * pushed the button below the fold on a phone. One sheet, sections divided by
 * hairlines, button inside it.
 *
 * `overflow-hidden` so the sections' square edges are clipped by the radius; no
 * width cap, because these screens fill the page like every other.
 */
export function MoneySheet({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The last band of the sheet: the refusal, the summary, the button.
 *
 * Tinted rather than bordered, so it reads as the foot of the card and not as
 * one more question.
 */
export function MoneyFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-t border-border bg-muted/30 px-5 py-5 sm:px-6', className)}>
      {children}
    </div>
  );
}

/**
 * A payment method, as a tile in a grid.
 *
 * Kept as tiles rather than folded into a select like the destination: there are
 * a handful of methods, they carry a LOGO the client recognises faster than the
 * name, and which one is chosen changes the rest of the form. The destination is
 * the opposite on all three counts.
 *
 * A real radio underneath, hidden with `sr-only` — arrow-key navigation within
 * the group, the focus ring and the announced checked state all come free, and a
 * `<div onClick>` would have to reimplement each of them badly.
 */
export function MethodTile({
  name,
  value,
  checked,
  onChange,
  title,
  logoUrl,
  badge,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: string;
  logoUrl?: string | null;
  badge?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        // `p-3` and `rounded-xl`, down from `p-4`/`rounded-2xl`: a method tile
        // is a radio button, and at the larger size a single-rail list read as
        // a hero card for the one option available.
        'relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
        checked
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />

      {/*
        The chip is a fixed HEIGHT with a minimum width, not a square.

        A payment brand mark is usually a WORDMARK — the Whish logo is 123×27, a
        4.5:1 ratio. In a 40px square, `object-contain` honoured that ratio by
        shrinking it to 28×6px: an unreadable sliver that looks like a broken
        image. The height is what keeps a row of tiles aligned; the width follows
        the artwork, floored so the icon fallback stays square and capped so a
        very wide mark cannot crowd out the method name beside it.
      */}
      <span className="flex h-10 min-w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background px-1.5">
        {/*
          Through `assetUrl`, NEVER the stored value raw. An operator-uploaded
          logo is stored as `/v1/uploads/…` — a path on the API, which the
          browser would otherwise resolve against THIS app's origin and 404. The
          fallback below is a generic wallet mark, so the failure was silent: the
          deposit screen simply showed no brand for the method the operator had
          just given one to.
        */}
        {assetUrl(logoUrl) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={assetUrl(logoUrl)}
            alt=""
            aria-hidden="true"
            className="h-7 w-auto max-w-24 object-contain"
          />
        ) : (
          <Wallet2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {badge}
      </span>

      {checked && (
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check className="h-3 w-3" />
        </span>
      )}
    </label>
  );
}

/**
 * A section INSIDE the one big card.
 *
 * These screens are a single rounded card rather than a stack of them: a
 * deposit is one task, and splitting it across four bordered panels made it
 * read as four. A hairline and a small heading are enough to separate the
 * questions without implying they are separate jobs.
 */
export function MoneySection({
  title,
  children,
  className,
}: {
  /**
   * OPTIONAL, because a section is not always the right place for a label.
   *
   * A step whose content carries its own headings — grouped tiles saying
   * "My wallets" and "Trading accounts" — gets a third label for one question if
   * this is also set, and a heading nobody needs is one a reader learns to skip
   * along with whatever sits beside it. Omitted renders no `<h2>` at all rather
   * than an empty one, which would leave the margin and an unlabelled heading in
   * the accessibility tree.
   */
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    /*
     * `py-4`, down from `py-5`. Three stacked sections at the larger padding
     * pushed a four-field form past the fold on a laptop, which on a money
     * screen means the submit button is somewhere the client has to go looking
     * for. The horizontal padding is unchanged — that is what keeps the card
     * from feeling cramped at the edges.
     */
    <section className={cn('border-t border-border px-5 py-4 first:border-t-0 sm:px-6', className)}>
      {title ? (
        <h2 className="mb-2.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/*
 * The fields live in `money-fields.tsx` and are re-exported here.
 *
 * This file holds the page's STRUCTURE — the sheet, its sections and footer, the
 * pickers — and that file holds what the client types into. They were one file
 * until it crossed the 340-line ceiling. Re-exporting keeps the three screens
 * importing from a single place, so the split is an internal detail.
 */
export { AmountField, AmountPresets, FormError, SummaryRow } from '@/components/money/money-fields';
