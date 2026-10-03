'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import type { RegisterField } from '@/lib/register-form';
import { t } from '@/lib/i18n';

/*
 * The account step's building blocks, apart from the page so the page stays
 * the flow — which step, what is sent, where a refusal goes — and these stay
 * what one box looks like.
 */
/**
 * Where the client is in sign-up. Two steps is short enough to show whole, and
 * showing it is what tells somebody on step 1 that the details come next — so
 * "Continue" does not read as "done".
 */
export function StepIndicator({ step }: { step: 1 | 2 }) {
  const title = step === 1 ? t('auth.register.stepAccount') : t('auth.register.stepDetails');
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-foreground">
          {t('auth.register.stepOf', { step: String(step), total: '2' })}
        </span>
        {' · '}
        {title}
      </p>
      <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
        <span className="h-1 rounded-full bg-primary" />
        <span className={`h-1 rounded-full ${step === 2 ? 'bg-primary' : 'bg-muted'}`} />
      </div>
    </div>
  );
}

/** One of the account step's boxes, with its icon, its hint and the server's sentence. */
export function TextField({
  field,
  label,
  icon: Icon,
  value,
  error,
  hint,
  invalid = false,
  describedBy: extraDescribedBy,
  type = 'text',
  trailing,
  onChange,
  ...input
}: {
  field: RegisterField;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  value: string;
  error?: string;
  hint?: string;
  /**
   * Red without a sentence of its own under the box — for when the sentence is
   * elsewhere on the form (a taken email's notice sits under Continue).
   */
  invalid?: boolean;
  /** The id of that sentence, so a screen reader reads it with the box. */
  describedBy?: string;
  type?: string;
  trailing?: React.ReactNode;
  onChange: (field: RegisterField, value: string) => void;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'placeholder' | 'autoComplete' | 'maxLength'
>) {
  const describedBy =
    [error ? `${field}-error` : '', hint && !error ? `${field}-hint` : '', extraDescribedBy ?? '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="text-xs font-semibold text-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute start-3.5 top-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={field}
          type={type}
          required
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          aria-invalid={Boolean(error) || invalid}
          aria-describedby={describedBy}
          className={`h-11 ps-10 aria-invalid:border-destructive ${trailing ? 'pe-11' : ''}`}
          {...input}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p id={`${field}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${field}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
