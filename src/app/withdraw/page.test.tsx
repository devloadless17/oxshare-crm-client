import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import WithdrawPage from './page';

/**
 * The withdrawal request screen — CORE-07, and CORE-08's confirmation step.
 *
 * What is pinned is the money discipline, not the layout:
 *
 *  - the amount reaches the API as the STRING the client typed, unparsed. §6.1
 *    says money never becomes a number, and a screen that "helpfully" normalised
 *    it would be the first place precision is lost.
 *  - the screen does NOT gate on the balance. R-5.1 puts every constraint on the
 *    server, which re-derives it from its own state; a client-side check would
 *    be a second source of truth for "can this be withdrawn" and the two would
 *    drift.
 *  - a server refusal is shown verbatim, because the server's reason (KYC level,
 *    daily cap, insufficient available) is the only accurate one.
 *  - success says HELD, not sent.
 *
 * ── And the OTP step (FR-CORE-08) ──────────────────────────────────────────
 *
 * The server binds the emailed code to the exact amount, currency, destination
 * and provider it was requested for, so this screen must not let those change
 * between the request and the submission. The tests for that are the ones worth
 * keeping if any of these are ever trimmed: they are the client half of the
 * guarantee that a code obtained for a small transfer cannot authorise a large
 * one.
 */

const { getWallets, requestWithdrawal, sendWithdrawalOtp } = vi.hoisted(() => ({
  getWallets: vi.fn(),
  requestWithdrawal: vi.fn(),
  sendWithdrawalOtp: vi.fn(),
}));

vi.mock('@/lib/api/wallet', () => ({ walletApi: { getWallets } }));
vi.mock('@/lib/api/payments', () => ({
  paymentsApi: { requestWithdrawal, sendWithdrawalOtp },
}));

const WALLETS = [
  {
    id: 'w1',
    userId: 'u1',
    currency: 'USD',
    balance: '250.00000000',
    onHold: '0.00000000',
    available: '250.00000000',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  /*
   * A part-finished withdrawal now survives in `sessionStorage` so a refresh on
   * the confirm step does not strand the client with a code the server can no
   * longer accept (lib/withdraw-intent.ts). jsdom shares one storage across the
   * whole file, so without this a test that reaches `confirm` hands the NEXT
   * test a form already on step two — which fails as "no Continue button" and
   * reads like a broken render rather than leaked state.
   */
  window.sessionStorage.clear();
  vi.clearAllMocks();
  getWallets.mockResolvedValue(WALLETS);
  requestWithdrawal.mockResolvedValue({ id: 'tx1', state: 'pending' });
  sendWithdrawalOtp.mockResolvedValue({
    message: 'A confirmation code has been sent.',
    required: true,
  });
});

/** Step one: state the withdrawal and ask for a code. */
async function statedWithdrawal(amount = '10.00', destination = 'IBAN-TEST-1') {
  const user = userEvent.setup();
  renderWithProviders(<WithdrawPage />);

  await user.type(await screen.findByLabelText(/amount/i), amount);
  await user.type(screen.getByLabelText(/destination/i), destination);
  await user.click(screen.getByRole('button', { name: /continue/i }));
  return user;
}

/** Both steps, ending in a submitted withdrawal. */
async function completedWithdrawal(amount = '10.00', destination = 'IBAN-TEST-1', code = '482913') {
  const user = await statedWithdrawal(amount, destination);
  await user.type(await screen.findByLabelText(/confirmation code/i), code);
  await user.click(screen.getByRole('button', { name: /request withdrawal/i }));
  return user;
}

describe('money discipline', () => {
  it('sends the amount as the exact string typed, with no parsing', async () => {
    // Deliberately full 8-dp precision and a trailing digit a float would lose.
    await completedWithdrawal('123.45678901');

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
    expect(requestWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '123.45678901', currency: 'USD' }),
      expect.any(String),
    );
    const [body] = requestWithdrawal.mock.calls[0] as [{ amount: unknown }];
    expect(typeof body.amount).toBe('string');
  });

  it('asks for the code against the SAME amount it later submits', async () => {
    /*
     * The client half of the binding guarantee. The server keys the code on the
     * intent, so if this screen requested a code for one amount and submitted
     * another, every withdrawal would be refused — and the failure would look
     * like a broken OTP rather than a broken form.
     */
    await completedWithdrawal('77.50000000', 'IBAN-XYZ');

    expect(sendWithdrawalOtp).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '77.50000000', destination: 'IBAN-XYZ', currency: 'USD' }),
    );
    expect(requestWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '77.50000000', destination: 'IBAN-XYZ' }),
      expect.any(String),
    );
  });

  it('does NOT block an amount above the available balance', async () => {
    // The server owns this decision (R-5.1). Refusing here would be a second
    // source of truth, and the two would drift the first time a limit changed.
    await completedWithdrawal('9999999.00');
    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
  });

  it("shows the server's refusal verbatim", async () => {
    requestWithdrawal.mockRejectedValue({
      response: { data: { message: 'Withdrawals require a verified account (KYC level 1).' } },
    });
    await completedWithdrawal();

    expect(await screen.findByText(/Withdrawals require a verified account/i)).toBeInTheDocument();
  });

  it('says the funds are HELD, not sent', async () => {
    await completedWithdrawal();

    // The backend holds the amount and writes no ledger entry until an admin
    // settles it. Telling the client "sent" would be a different, wrong story
    // about their money.
    expect(await screen.findByText(/held against your balance/i)).toBeInTheDocument();
    expect(screen.queryByText(/has been sent/i)).not.toBeInTheDocument();
  });

  it('requires an amount and a destination before calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    await screen.findByLabelText(/amount/i);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(sendWithdrawalOtp).not.toHaveBeenCalled();
    expect(requestWithdrawal).not.toHaveBeenCalled();
  });
});

describe('the confirmation step — FR-CORE-08', () => {
  it('does not submit the withdrawal until a code is entered', async () => {
    const user = await statedWithdrawal();

    // Step one asked for a code and NOTHING else. A screen that submitted here
    // would be one where the OTP is decoration.
    expect(sendWithdrawalOtp).toHaveBeenCalledTimes(1);
    expect(requestWithdrawal).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));
    expect(requestWithdrawal).not.toHaveBeenCalled();
    expect(await screen.findByText(/6-digit code/i)).toBeInTheDocument();
  });

  it('locks the amount and destination once a code has been sent', async () => {
    /*
     * The whole point. The code is bound to these values; leaving them editable
     * would let a client (or anything driving the page) obtain a code for one
     * withdrawal and submit another. The server would refuse it — but the screen
     * should not offer the move at all.
     */
    await statedWithdrawal();

    expect(await screen.findByLabelText(/amount/i)).toBeDisabled();
    expect(screen.getByLabelText(/destination/i)).toBeDisabled();
  });

  it('clears the code when the client goes back to change the details', async () => {
    // The code was minted for the OLD intent. Carrying it into an edited
    // withdrawal would guarantee a refusal the message cannot explain well.
    const user = await statedWithdrawal();
    await user.type(await screen.findByLabelText(/confirmation code/i), '111111');

    await user.click(screen.getByRole('button', { name: /change amount or destination/i }));
    expect(await screen.findByLabelText(/amount/i)).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByLabelText(/confirmation code/i)).toHaveValue('');
  });

  it('sends the code with the withdrawal', async () => {
    await completedWithdrawal('10.00', 'IBAN-TEST-1', '482913');

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
    expect(requestWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ otp: '482913' }),
      expect.any(String),
    );
  });

  it('accepts only digits in the code field', async () => {
    const user = await statedWithdrawal();
    const field = await screen.findByLabelText(/confirmation code/i);
    await user.type(field, 'a1b2c3d4e5f6');
    expect(field).toHaveValue('123456');
  });

  it('mints a NEW idempotency key after a rejected code', async () => {
    /*
     * A rejected code creates no withdrawal — the request never reaches the money
     * path. Reusing the key would make the corrected retry collide with the
     * cached failure, and the client could never complete a withdrawal they are
     * entitled to. The key names one intended withdrawal; none happened.
     */
    requestWithdrawal.mockRejectedValueOnce({
      response: { data: { message: 'That confirmation code is not valid for this withdrawal.' } },
    });
    const user = await completedWithdrawal('10.00', 'IBAN-TEST-1', '000000');

    expect(await screen.findByText(/not valid for this withdrawal/i)).toBeInTheDocument();
    // The field is cleared, so a stale code is not resubmitted by a stray click.
    expect(await screen.findByLabelText(/confirmation code/i)).toHaveValue('');

    await user.type(screen.getByLabelText(/confirmation code/i), '482913');
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(2));
    const [, firstKey] = requestWithdrawal.mock.calls[0] as [unknown, string];
    const [, secondKey] = requestWithdrawal.mock.calls[1] as [unknown, string];
    expect(secondKey).not.toBe(firstKey);
  });
});

describe('when the operator has the OTP control switched off', () => {
  it('submits without a code, and never asks for one', async () => {
    /*
     * The switch is a server-side setting (Settings → Security, master admin
     * only). This screen must not branch on its own guess: it always asks, and
     * the server answers `required: false`. A boolean, never the message text —
     * a copy edit must not change what the form does.
     */
    sendWithdrawalOtp.mockResolvedValue({
      message: 'Withdrawal confirmation is not required.',
      required: false,
    });

    const user = await statedWithdrawal();
    expect(screen.queryByLabelText(/confirmation code/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
    const [body] = requestWithdrawal.mock.calls[0] as [Record<string, unknown>];
    // No `otp` key at all, rather than an empty one the server would reject.
    expect(body).not.toHaveProperty('otp');
  });
});
