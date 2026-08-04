import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import WithdrawPage from './page';

/**
 * The withdrawal request screen — CORE-07.
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
 */

const { getWallets, requestWithdrawal } = vi.hoisted(() => ({
  getWallets: vi.fn(),
  requestWithdrawal: vi.fn(),
}));

vi.mock('@/lib/api/wallet', () => ({ walletApi: { getWallets } }));
vi.mock('@/lib/api/payments', () => ({ paymentsApi: { requestWithdrawal } }));

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
  vi.clearAllMocks();
  getWallets.mockResolvedValue(WALLETS);
  requestWithdrawal.mockResolvedValue({ id: 'tx1', state: 'pending' });
});

describe('withdraw', () => {
  it('sends the amount as the exact string typed, with no parsing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    const amount = await screen.findByLabelText(/amount/i);
    // Deliberately full 8-dp precision and a trailing digit a float would lose.
    await user.type(amount, '123.45678901');
    await user.type(screen.getByLabelText(/destination/i), 'IBAN-TEST-1');
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
    expect(requestWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '123.45678901', currency: 'USD' }),
    );
    // Not a number, at any point.
    const [body] = requestWithdrawal.mock.calls[0] as [{ amount: unknown }];
    expect(typeof body.amount).toBe('string');
  });

  it('does NOT block an amount above the available balance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    await user.type(await screen.findByLabelText(/amount/i), '9999999.00');
    await user.type(screen.getByLabelText(/destination/i), 'IBAN-TEST-1');
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    // The server owns this decision (R-5.1). Refusing here would be a second
    // source of truth, and the two would drift the first time a limit changed.
    await waitFor(() => expect(requestWithdrawal).toHaveBeenCalledTimes(1));
  });

  it("shows the server's refusal verbatim", async () => {
    requestWithdrawal.mockRejectedValue({
      response: { data: { message: 'Withdrawals require a verified account (KYC level 1).' } },
    });
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    await user.type(await screen.findByLabelText(/amount/i), '10.00');
    await user.type(screen.getByLabelText(/destination/i), 'IBAN-TEST-1');
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    // The server's reason is the only accurate one — a generic "failed" would
    // leave the client guessing which of several rules they hit.
    expect(await screen.findByText(/Withdrawals require a verified account/i)).toBeInTheDocument();
  });

  it('says the funds are HELD, not sent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    await user.type(await screen.findByLabelText(/amount/i), '10.00');
    await user.type(screen.getByLabelText(/destination/i), 'IBAN-TEST-1');
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    // The backend holds the amount and writes no ledger entry until an admin
    // settles it. Telling the client "sent" would be a different, wrong story
    // about their money.
    const body = await screen.findByText(/held against your balance/i);
    expect(body).toBeInTheDocument();
    expect(screen.queryByText(/has been sent/i)).not.toBeInTheDocument();
  });

  it('requires an amount and a destination before calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<WithdrawPage />);

    await screen.findByLabelText(/amount/i);
    await user.click(screen.getByRole('button', { name: /request withdrawal/i }));

    expect(requestWithdrawal).not.toHaveBeenCalled();
  });
});
