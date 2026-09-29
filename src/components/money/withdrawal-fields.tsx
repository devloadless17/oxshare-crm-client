'use client';

import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { t } from '@/lib/i18n';

/**
 * What a payout method asks the client for — by the KIND its payout channel
 * declares (backend 0168), never by the method's key.
 *
 * ## The provider says what it needs; this file says how to ask
 *
 * A method runs on one payment provider's payout channel, and the channel
 * declares what reaches the money: a phone number (Whish), a wallet address on
 * one network (a crypto rail), an IBAN, free text (the desk pays by hand), or
 * nothing at all (cash collected in person). The API sends that kind with each
 * method (`destinationKind`, `destinationNetwork`); this file turns it into a
 * control. A new provider needs no change here unless it asks for a kind nobody
 * has asked for before.
 *
 * It used to be a map keyed by method KEY (`whish` → phone), which made a
 * method's key decide how clients were paid — a second Whish method with a
 * generated key would have asked for "account" text instead of a phone.
 *
 * ## There is no "destination" label any more
 *
 * Each kind names its own field in its own words, labelled with the method's
 * own name where that helps ("Whish Money phone number").
 */

export type DestinationKind = 'none' | 'phone' | 'crypto_address' | 'iban' | 'text';

/** Whether the client must type anything for this kind — a cash pickup needs nothing. */
export function needsDestination(kind: DestinationKind | undefined): boolean {
  return kind !== 'none';
}

function labelFor(kind: DestinationKind, methodName: string, network: string | null): string {
  switch (kind) {
    case 'phone':
      return t('withdraw.phoneLabel', { method: methodName });
    case 'crypto_address':
      return network
        ? t('withdraw.cryptoAddressNetworkLabel', { network })
        : t('withdraw.cryptoAddressLabel');
    case 'iban':
      return t('withdraw.ibanLabel');
    default:
      return t('withdraw.genericAccountLabel', { method: methodName });
  }
}

/**
 * The destination control for the chosen rail.
 *
 * Renders the spec above, or a labelled text box for a rail this build does not
 * know yet — see the module note.
 */
export function WithdrawalDestinationField({
  kind,
  network,
  methodName,
  value,
  onChange,
}: {
  /** From the method's payout channel. Unknown (older API) reads as text. */
  kind: DestinationKind | undefined;
  network: string | null;
  /** The rail's display name, for labels that name it. */
  methodName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const resolved = kind ?? 'text';
  // Collected in person: nothing to ask, and nothing is sent.
  if (resolved === 'none') {
    return <p className="text-sm text-muted-foreground">{t('withdraw.cashPickup')}</p>;
  }
  const label = labelFor(resolved, methodName, network);
  const phone = resolved === 'phone';

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
      <label className="sr-only" htmlFor={phone ? undefined : 'withdraw-destination'}>
        {label}
      </label>
      {phone ? (
        <PhoneInput value={value} onChange={onChange} aria-label={label} />
      ) : (
        <Input
          id="withdraw-destination"
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

        A kind that genuinely needs a line of help (an IBAN's country rule)
        can add one here; Whish does not.
      */}
    </div>
  );
}
