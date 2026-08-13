'use client';

import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { t, type MessageKey } from '@/lib/i18n';

/**
 * What each payout rail asks the client for, keyed by the rail's own key.
 *
 * ## The rails are DATA; the fields they need are CODE
 *
 * `withdrawal_payment_methods` is a database table, so the operator can enable
 * a rail without a deploy. What a rail needs from the client is not data,
 * though — Whish needs a phone number, a bank needs an IBAN and a holder name,
 * USDT needs an address and a network. Each of those is a different control
 * with different validation and different help text, and none of it can be
 * expressed as a row.
 *
 * So the split is: the DATABASE decides which rails exist and what they are
 * called; THIS FILE decides what each one asks for. Adding a rail is a row plus
 * an entry here — and the entry is what stops a new method silently rendering
 * the generic text box that the old "Destination" field was.
 *
 * ## There is no "destination" label any more
 *
 * The field used to be called Destination with the placeholder "IBAN, or your
 * USDT TRC20 address" — a label that named a database column and a placeholder
 * that listed the options for rails the client had not chosen. A client sending
 * to Whish was asked for a destination and shown an IBAN hint. Each rail now
 * names its own field in its own words.
 *
 * ## An unknown key still renders something usable
 *
 * A rail the operator adds before this file learns about it falls back to a
 * plain text input labelled with the METHOD'S OWN NAME ("Whish Money account").
 * That is deliberately not a crash and not a hidden field: the server is the
 * authority on whether the value is acceptable, and a client who can still type
 * their account into a sensibly-labelled box can still be paid.
 */

export interface WithdrawalFieldSpec {
  /** The control to render. `phone` gets the country-picker input. */
  kind: 'phone' | 'text';
  labelKey: MessageKey;
  /** Shown under the field. Says what the value is and what happens if wrong. */
  hintKey: MessageKey;
  placeholder?: string;
}

const FIELDS: Record<string, WithdrawalFieldSpec> = {
  /*
   * Whish pays a phone number, Whish-to-Whish. The server validates it against
   * Whish's own rules (`wish-phone.ts`) at request time, so this control shapes
   * the typing and does not decide whether the number is good.
   */
  whish: {
    kind: 'phone',
    labelKey: 'withdraw.whishPhoneLabel',
    hintKey: 'withdraw.whishPhoneHint',
  },
};

export function fieldSpecFor(methodKey: string): WithdrawalFieldSpec | undefined {
  // `Object.hasOwn`, never a bare lookup: a key of 'constructor' would
  // otherwise return an inherited function and skip the fallback.
  return Object.hasOwn(FIELDS, methodKey) ? FIELDS[methodKey] : undefined;
}

/**
 * The destination control for the chosen rail.
 *
 * Renders the spec above, or a labelled text box for a rail this build does not
 * know yet — see the module note.
 */
export function WithdrawalDestinationField({
  methodKey,
  methodName,
  value,
  onChange,
}: {
  methodKey: string;
  /** The rail's display name, used to label an unknown rail's fallback field. */
  methodName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const spec = fieldSpecFor(methodKey);

  const label = spec ? t(spec.labelKey) : t('withdraw.genericAccountLabel', { method: methodName });

  return (
    <div className="space-y-1">
      {/*
        `sr-only` — VISUALLY removed, still announced.

        The section this sits in is already headed "RECIPIENT", so the visible
        label under it ("Whish phone number") was the second label on one field:
        two headings, one input, in a card with four controls total. Deleting the
        element outright was the obvious move and the wrong one — the phone
        branch is a country button plus a text box with no visible text of its
        own, so a screen reader would have announced an unlabelled edit field and
        the client would have had nothing to tell them what to type.

        No `htmlFor` on the phone branch: `PhoneInput` owns its own markup and
        exposes no id to point at, so `htmlFor` there would name an element that
        does not exist — worse than no association, because it looks like one.
      */}
      <label className="sr-only" htmlFor={spec ? undefined : 'withdraw-destination'}>
        {label}
      </label>
      {spec?.kind === 'phone' ? (
        <PhoneInput value={value} onChange={onChange} aria-label={label} />
      ) : (
        <Input
          id="withdraw-destination"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec?.placeholder}
          autoComplete="off"
          className="h-9 font-mono text-sm"
        />
      )}
      {/*
        The hint is GONE, on request — for Whish it read "The Whish account that
        will receive the money. A payout sent to the wrong number cannot be
        recalled." The first sentence restates the section heading and the second
        is a warning about a mistake the client has not made yet, on a form whose
        every other field is unannotated.

        `hintKey` stays on the spec rather than being deleted with it: a rail
        added later may genuinely need a line of help (an IBAN's country rule, a
        USDT network choice), and that is a per-rail decision. Whish does not.
      */}
    </div>
  );
}
