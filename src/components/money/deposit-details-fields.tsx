'use client';

import * as React from 'react';
import type { PaymentMethod } from '@/lib/api/deposits';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { t } from '@/lib/i18n';
import { isBarePhonePrefix } from '@/components/kyc/custom-step';

export type ProofFieldQuestion = PaymentMethod['proofFields'][number];

/**
 * The details an offline method asks for with the receipt — the phone the money
 * was sent from, a transfer code (backend 0163) — in the method's own words.
 *
 * The questions come from the method (`proofFields`: only the ones the broker
 * shows, in their order), so a new question needs no change here. The server
 * is the judge: it refuses a missing required answer or an incomplete phone
 * under `details.<fieldId>`, and the page hands those sentences back here to be
 * shown under the input they belong to.
 */
export function DepositDetailsFields({
  fields,
  values,
  onChange,
  errors,
  disabled,
}: {
  fields: ProofFieldQuestion[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Keyed by field id (the `details.` prefix already removed). */
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const baseId = React.useId();
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `${baseId}-${field.id}`;
        const error = errors?.[field.id];
        const set = (value: string) => onChange({ ...values, [field.id]: value });
        return (
          <div key={field.id} className="space-y-1">
            {/*
              No `htmlFor` on the phone branch: `PhoneInput` owns its markup and
              exposes no id, so it is named by `aria-label` instead (the same
              reason `WithdrawalDestinationField` gives).
            */}
            <label
              htmlFor={field.type === 'phone' ? undefined : id}
              className="text-xs font-medium text-foreground"
            >
              {field.label}
              {!field.required && (
                <span className="ms-1 font-normal text-muted-foreground">
                  {t('deposit.detailOptional')}
                </span>
              )}
            </label>
            {field.type === 'phone' ? (
              <PhoneInput
                value={values[field.id] ?? ''}
                onChange={set}
                disabled={disabled}
                aria-label={field.label}
              />
            ) : (
              <Input
                id={id}
                value={values[field.id] ?? ''}
                onChange={(e) => set(e.target.value)}
                disabled={disabled}
                maxLength={120}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                className="h-9 font-mono text-sm"
              />
            )}
            {field.hint && !error && (
              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
            )}
            {error && (
              <p role="alert" className="text-[11px] text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Is a required detail still empty? The page adds this to the step's problem,
 * as it does a missing receipt, so the button says what is missing before the
 * server has to. A phone holding only its dial code counts as empty.
 */
export function missingDetail(
  fields: ProofFieldQuestion[],
  values: Record<string, string>,
): ProofFieldQuestion | undefined {
  return fields.find((field) => {
    if (!field.required) return false;
    const value = (values[field.id] ?? '').trim();
    return field.type === 'phone' ? isBarePhonePrefix(value) : value === '';
  });
}

/**
 * The answers worth sending: the asked fields only, trimmed, and none that is
 * empty — a phone holding only its dial code included. What is left out is the
 * server's to judge (a required one it refuses under its own key).
 */
export function answeredDetails(
  fields: ProofFieldQuestion[],
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.id] ?? '').trim();
    if (value === '' || (field.type === 'phone' && isBarePhonePrefix(value))) continue;
    out[field.id] = value;
  }
  return out;
}
