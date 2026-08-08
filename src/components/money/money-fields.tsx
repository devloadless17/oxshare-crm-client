'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';

/**
 * The fields inside the money sheet — amount, presets, refusal, summary row.
 *
 * Split out of `money-shell.tsx` when that file outgrew the 340-line ceiling.
 * The division is by ROLE: `money-shell` holds the page's structure (the sheet,
 * its sections and footer, the pickers), this holds what the client types into
 * and reads back. Both are re-exported from `money-shell`, so the three screens
 * still import from one place.
 */

/**
 * The amount field, with the currency shown inside it.
 *
 * ## `inputMode="decimal"`, and the value stays a STRING
 *
 * A phone shows the numeric keypad without the `type="number"` behaviours that
 * make money entry worse: a scroll wheel that silently changes the value, a
 * spinner nobody wants on a payment, and — the reason that matters here —
 * `valueAsNumber` semantics that invite somebody downstream to read a float off
 * a NUMERIC(28,8) field.
 *
 * The value is never parsed on this side. It goes to the API as typed.
 */
export function AmountField({
  value,
  onChange,
  currency,
  label,
  hint,
  max,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  label: string;
  hint?: React.ReactNode;
  /** "Use everything available" — omitted when there is no such figure. */
  max?: { amount: string; label: string };
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {max && (
          <button
            type="button"
            onClick={() => onChange(max.amount)}
            disabled={disabled}
            className="focus-outline rounded text-[11px] font-semibold text-link hover:underline disabled:opacity-50"
          >
            {max.label}
          </button>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          disabled={disabled}
          autoFocus={autoFocus}
          className="h-14 pe-16 text-2xl font-bold tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm font-semibold text-muted-foreground">
          {currency}
        </span>
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Quick-pick amounts.
 *
 * Presets are a convenience, never a constraint — the field above still accepts
 * anything. They exist because most deposits are round numbers and typing on a
 * phone is the slowest part of this flow.
 *
 * Which presets to offer is decided by the caller, through `presetsWithin` in
 * `amount-presets.ts`: a preset the form would refuse is worse than no preset.
 */
export function AmountPresets({
  presets,
  currency,
  onPick,
  disabled,
}: {
  presets: string[];
  currency: string;
  onPick: (amount: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((amount) => (
        <button
          key={amount}
          type="button"
          onClick={() => onPick(amount)}
          disabled={disabled}
          className="focus-outline rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
        >
          {formatMoney(amount, currency)}
        </button>
      ))}
    </div>
  );
}

/**
 * A refusal, said out loud.
 *
 * `role="alert"` so it is ANNOUNCED rather than merely appearing. On a money
 * form the error is frequently the only thing that changed on the page, and a
 * client using a screen reader would otherwise press submit and hear nothing.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
    >
      {message}
    </p>
  );
}

/** A label/value row for a confirmation summary. */
export function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-end break-words',
          strong ? 'text-base font-bold tabular-nums' : 'text-sm font-medium',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
