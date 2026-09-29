import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawalDestinationField, needsDestination } from './withdrawal-fields';

/**
 * The method's payout CHANNEL decides what the withdrawal form asks for
 * (backend 0168) — never the method's key. These pin that each kind gets its
 * own control and its own words, that a cash pickup asks for nothing, and that
 * an older API with no kind still renders something a client can fill in.
 */

describe('what a payout asks the client for', () => {
  it('asks nothing of a cash pickup, and something of every other kind', () => {
    expect(needsDestination('none')).toBe(false);
    for (const kind of ['phone', 'crypto_address', 'iban', 'text'] as const) {
      expect(needsDestination(kind)).toBe(true);
    }
    // No kind (an API before 0168): ask, as the form always did.
    expect(needsDestination(undefined)).toBe(true);
  });
});

describe('the destination field', () => {
  it('gives a phone channel the phone control, named by the method, never "destination"', () => {
    /*
     * By KIND: a second Whish method with a generated key gets the same phone
     * control — keyed by method key, it fell back to a text box.
     */
    render(
      <WithdrawalDestinationField
        kind="phone"
        network={null}
        methodName="Whish Money"
        value=""
        onChange={vi.fn()}
      />,
    );

    // `getByLabelText`: the visible label is sr-only (the section heading says
    // "Recipient"), and PhoneInput has no id to point at, so the phone field
    // must carry its name itself — the field that decides WHERE MONEY GOES.
    expect(screen.getByLabelText(/whish money phone number/i)).toBeInTheDocument();
    expect(screen.queryByText(/^destination$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IBAN/i)).not.toBeInTheDocument();
  });

  it('names a crypto address by its network, since an address is valid on one only', () => {
    render(
      <WithdrawalDestinationField
        kind="crypto_address"
        network="TRC20"
        methodName="USDT"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/TRC20 wallet address/i)).toBeInTheDocument();
  });

  it('shows no field for a cash pickup', () => {
    render(
      <WithdrawalDestinationField
        kind="none"
        network={null}
        methodName="Cash"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/collected in person/i)).toBeInTheDocument();
  });

  it('falls back to a text box named by the method when the API sends no kind', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WithdrawalDestinationField
        kind={undefined}
        network={null}
        methodName="SEPA transfer"
        value=""
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText(/SEPA transfer account/i)).toBeInTheDocument();
    // The value goes to the server verbatim; the server owns each provider's rules.
    await user.type(screen.getByRole('textbox'), 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });
});
