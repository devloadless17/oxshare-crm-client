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

  it('omits a field it does not have rather than showing a blank labelled row', () => {
    renderWithProviders(<TransactionDetails tx={base} onClose={vi.fn()} />);

    // A pending row has no settlement date; a row labelled "Completed" with
    // nothing in it reads as a settlement that lost its date.
    expect(screen.queryByText(/completed/i)).toBeNull();
    expect(screen.queryByText(/why this was refused/i)).toBeNull();
  });
});
