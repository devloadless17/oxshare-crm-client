import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { TransactionDetails } from './transaction-details';
import type { Transaction } from '@/lib/api/payments';

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
