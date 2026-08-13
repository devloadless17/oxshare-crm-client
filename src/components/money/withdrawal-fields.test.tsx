import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawalDestinationField, fieldSpecFor } from './withdrawal-fields';

/**
 * The rail decides what the withdrawal form asks for.
 *
 * The rails themselves are DATA (`withdrawal_payment_methods`), so this file
 * pins the half that is code: that a known rail gets its own control and its
 * own words, and that a rail this build has never heard of still renders
 * something a client can fill in rather than nothing or a crash.
 */

describe('the per-rail field spec', () => {
  it('gives Whish a phone control, not a generic text box', () => {
    // The whole point of the registry: Whish pays a phone number, so the client
    // gets the country-code input rather than a box labelled "Destination".
    expect(fieldSpecFor('whish')?.kind).toBe('phone');
  });

  it('returns nothing for a rail this build has not learned', () => {
    expect(fieldSpecFor('sepa')).toBeUndefined();
  });

  it('is not fooled by inherited object properties', () => {
    /*
     * `Object.hasOwn`, not a bare lookup. A rail keyed 'constructor' would
     * otherwise resolve to an inherited function — truthy — and skip the
     * fallback, rendering a spec that is not a spec.
     */
    expect(fieldSpecFor('constructor')).toBeUndefined();
    expect(fieldSpecFor('toString')).toBeUndefined();
  });
});

describe('the destination field', () => {
  it('labels Whish by its own field, never as a "destination"', () => {
    render(
      <WithdrawalDestinationField
        methodKey="whish"
        methodName="Whish Money"
        value=""
        onChange={vi.fn()}
      />,
    );

    // The old copy called this "Destination" — a database column rather than a
    // question — and hinted at an IBAN for a rail the client had not chosen.
    expect(screen.getByText(/whish phone number/i)).toBeInTheDocument();
    expect(screen.queryByText(/^destination$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IBAN/i)).not.toBeInTheDocument();
  });

  it('keeps the phone field ACCESSIBLY named once the visible label is hidden', () => {
    /*
     * The regression this exists to catch, and it is invisible on screen.
     *
     * The visible label was dropped so the field is not headed twice — once by
     * the "Recipient" section and once by itself. `PhoneInput` renders a country
     * button and a bare text box with no text of its own and no id for a
     * `htmlFor` to point at, so hiding the label without passing `aria-label`
     * leaves the one field that decides WHERE A CLIENT'S MONEY GOES announcing
     * as an unlabelled edit box. Nothing about the rendered page would look
     * wrong, which is exactly why a test has to hold it.
     */
    render(
      <WithdrawalDestinationField
        methodKey="whish"
        methodName="Whish Money"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/whish phone number/i)).toBeInTheDocument();
  });

  it('falls back to the RAIL’S OWN NAME for an unknown key', () => {
    /*
     * The forward-compatible branch. An operator can enable a rail before this
     * app learns its field, and the client must still be able to be paid — so
     * the fallback is a labelled text box, not a hidden field or a crash.
     */
    render(
      <WithdrawalDestinationField
        methodKey="sepa"
        methodName="SEPA transfer"
        value=""
        onChange={vi.fn()}
      />,
    );

    /*
     * `getByLabelText`, not `getByText`, and this is now load-bearing rather
     * than merely tidier.
     *
     * The visible label was removed (the section heading above it already says
     * "Recipient") and survives only as `sr-only`, so a text query would still
     * pass while proving nothing a client can use. Querying the input BY its
     * label proves the `htmlFor`/`id` association a screen reader depends on —
     * which is the whole reason the element was hidden instead of deleted.
     */
    expect(screen.getByLabelText(/SEPA transfer account/i)).toBeInTheDocument();
  });

  it('reports what the client typed, verbatim', async () => {
    // The value goes to the server as a plain string; this control shapes the
    // typing and does not validate — the server owns Whish's own rules.
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <WithdrawalDestinationField
        methodKey="sepa"
        methodName="SEPA transfer"
        value=""
        onChange={onChange}
      />,
    );

    await user.type(screen.getByRole('textbox'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });
});
