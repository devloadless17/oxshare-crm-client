import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TransactionDetails } from './transaction-details';
import type { Transaction } from '@/lib/api/payments';

/*
 * A transfer's ends are NAMED from the client's own wallets and accounts, so
 * the two lists are stubbed with one of each.
 */
vi.mock('@/lib/api/wallet', () => ({
  walletApi: {
    getWallets: vi.fn(() => Promise.resolve([{ id: 'w1', name: 'USD Wallet', currency: 'USD' }])),
  },
}));
vi.mock('@/lib/api/trading', () => ({
  tradingApi: {
    getAccounts: vi.fn(() => Promise.resolve([{ id: 'a1', name: 'Main', login: '7001' }])),
  },
}));

/*
 * The regression: a refused withdrawal reached the client as a red pill and
 * nothing else. The reason was on the client's OWN response the whole time —
 * the only place it ever appeared was a transient bell notification, so a
 * client who missed it had the money back in their wallet and no explanation
 * anywhere they could return to.
 */
const base = {
  id: 't1',
  kind: 'withdrawal',
  direction: 'withdrawal',
  amount: '100.00000000',
  currency: 'USD',
  state: 'rejected',
  createdAt: '2026-08-01T10:00:00.000Z',
  walletId: 'w1',
  tradingAccountId: 'a1',
} as unknown as Transaction;

describe('TransactionDetails', () => {
  it('shows WHY a withdrawal was refused', () => {
    renderWithProviders(
      <TransactionDetails
        tx={{ ...base, rejectionReason: 'Destination details incomplete.' }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/destination details incomplete/i)).toBeTruthy();
  });

  /*
   * ── A TRANSFER SAYS WHICH WAY THE MONEY WENT ───────────────────────────
   *
   * A transfer has no method, no provider and no destination, so this panel
   * showed one with no route at all: an amount, a date, a state, and no answer
   * to "between what and what". Funding an account and pulling the money back
   * were indistinguishable.
   *
   * `direction` is WALLET-SIDE for every kind in the union, which is the only
   * thing that makes this readable without a new field: `deposit` means the
   * money arrived in the wallet, so it came FROM the trading account.
   */
  /*
   * And by NAME: which wallet, which account. A client with two trading
   * accounts could not tell from "Wallet → Trading account" which one a
   * transfer went to.
   */
  const fromTo = async (from: RegExp, to: RegExp) => {
    const fromRow = (await screen.findByText('From')).parentElement!;
    const toRow = screen.getByText('To').parentElement!;
    await screen.findByText(to);
    expect(fromRow.textContent).toMatch(from);
    expect(toRow.textContent).toMatch(to);
  };

  it('says a transfer went from the trading account INTO the wallet', async () => {
    renderWithProviders(
      <TransactionDetails
        tx={{ ...base, kind: 'transfer', direction: 'deposit', state: 'success' }}
        onClose={vi.fn()}
      />,
    );

    await fromTo(/Main · #7001/, /USD Wallet/);
  });

  it('and the OTHER way for the opposite direction', async () => {
    renderWithProviders(
      <TransactionDetails
        tx={{ ...base, kind: 'transfer', direction: 'withdrawal', state: 'success' }}
        onClose={vi.fn()}
      />,
    );

    // The distinction is the whole point: the two directions must not render
    // the same words, which is what they did before.
    await fromTo(/USD Wallet/, /Main · #7001/);
  });

  it('names the commission wallet on a commission transfer', async () => {
    renderWithProviders(
      <TransactionDetails
        tx={{ ...base, kind: 'commission_transfer', direction: 'deposit', state: 'success' }}
        onClose={vi.fn()}
      />,
    );

    // One direction only — commission moves into the main wallet, never back.
    await fromTo(/Commission wallet/, /USD Wallet/);
  });

  it('shows where a settled withdrawal actually went', () => {
    renderWithProviders(
      <TransactionDetails
        tx={{
          ...base,
          state: 'success',
          destination: '+961 70 123 456',
          settledAt: '2026-08-02T09:00:00.000Z',
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('+961 70 123 456')).toBeTruthy();
  });

  /*
   * The two directions mean OPPOSITE things by the same red block, and this
   * dialog renders both. A refused withdrawal was debited at request, so the
   * money is already back; a refused deposit was never debited, so nothing
   * comes back — and an offline depositor may be holding a receipt for money
   * they really did send outside the platform. One shared block of copy for
   * both is how the client most likely to be out of pocket gets told the least.
   */
  it('tells a refused DEPOSIT that nothing was taken from the wallet', () => {
    renderWithProviders(
      <TransactionDetails
        tx={
          {
            ...base,
            kind: 'payment',
            direction: 'deposit',
            rejectionReason: 'No payment matching this receipt has reached our account',
          } as unknown as Transaction
        }
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/nothing was taken from your wallet/i)).toBeTruthy();
  });

  it('does NOT tell a refused withdrawal that, because its money DID come back', () => {
    renderWithProviders(
      <TransactionDetails
        tx={{ ...base, rejectionReason: 'Details incomplete.' }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText(/nothing was taken from your wallet/i)).toBeNull();
  });

  it('omits a field it does not have rather than showing a blank labelled row', () => {
    renderWithProviders(<TransactionDetails tx={base} onClose={vi.fn()} />);

    // A pending row has no settlement date; a row labelled "Completed" with
    // nothing in it reads as a settlement that lost its date.
    expect(screen.queryByText(/completed/i)).toBeNull();
    expect(screen.queryByText(/why this was refused/i)).toBeNull();
  });
});
