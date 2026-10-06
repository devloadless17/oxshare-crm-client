'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import type { PaymentMethod } from '@/lib/api/deposits';
import { Button } from '@/components/ui/button';
import { formatPhone } from '@/lib/profile';
import { localized, t } from '@/lib/i18n';

export type PayToDetail = PaymentMethod['payToFields'][number];

/**
 * WHERE to send the money for a method paid outside the platform — the phone a
 * transfer goes to, an account name (backend 0199) — in the broker's own words.
 *
 * Read-only: these are the broker's details, not questions. The server sends
 * only the shown ones, and only for an offline method, so this renders whatever
 * it is given and nothing when it is given nothing. Each value has a Copy
 * button, because the next thing the client does is paste it into OMT or Whish.
 */
export function DepositPayTo({ fields }: { fields: PayToDetail[] }) {
  return (
    <PayToDetails fields={fields} title={t('deposit.payToTitle')} hint={t('deposit.payToHint')} />
  );
}

/** The card on the withdraw form, for the rail the client picked. */
export function WithdrawPayTo({ fields }: { fields?: readonly PayToDetail[] }) {
  return <PayToDetails fields={fields ?? []} title={t('withdraw.payToTitle')} />;
}

/**
 * The same card for any method: a withdrawal rail shows its details too (backend
 * 0202) — where to collect cash, a reference to quote — under its own title.
 */
export function PayToDetails({
  fields,
  title,
  hint,
}: {
  fields: readonly PayToDetail[];
  title: string;
  hint?: string;
}) {
  const titleId = React.useId();
  if (fields.length === 0) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3"
    >
      <div className="space-y-0.5">
        <h3 id={titleId} className="text-xs font-semibold text-foreground">
          {title}
        </h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <ul className="space-y-2">
        {fields.map((field) => (
          <PayToRow key={field.id} field={field} />
        ))}
      </ul>
    </section>
  );
}

function PayToRow({ field }: { field: PayToDetail }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const label = localized(field.label, field.labelAr);
  const hint = field.hint ? localized(field.hint, field.hintAr) : null;
  // A phone is stored E.164 and read grouped (`+961 70 123 456`); the copy is the raw number.
  const shown = field.type === 'phone' ? (formatPhone(field.value) ?? field.value) : field.value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Said, not swallowed: the clipboard is unavailable over plain HTTP and can
      // be denied — the value stays selectable on screen either way.
      setFailed(true);
    }
  };

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        {/* Isolated left to right, but aligned with its label in either direction. */}
        <span className="block break-all font-mono text-sm font-medium text-foreground">
          <bdi dir="ltr">{shown}</bdi>
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        {failed && (
          <span role="alert" className="block text-[11px] text-destructive">
            {t('deposit.copyFailed')}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copy()}
        aria-label={t('deposit.copyValue', { label })}
        className="shrink-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {copied ? t('deposit.copied') : t('deposit.copy')}
      </Button>
      {/* `role="status"` so the outcome is announced rather than only shown. */}
      <span role="status" className="sr-only">
        {copied ? t('deposit.copiedValue', { label }) : ''}
      </span>
    </li>
  );
}
