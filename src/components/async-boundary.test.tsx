import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AsyncBoundary } from './async-boundary';

/**
 * THE ERROR CARD SHOWED THE CLIENT NOTHING THE API SAID.
 *
 * This branch rendered `errorMessage ?? t('common.genericError')` and never
 * looked at the API's message at all — so a 400 that named exactly what was
 * wrong reached the client as *"Something went wrong. Please try again."*
 *
 * Its ADMIN near-twin had the opposite loss: it rendered
 * `apiErrorMessage(error, errorMessage ?? …)`, and that helper prefers
 * `response.data.message`, which the backend puts on every error envelope — so
 * there the screen's own sentence was the half that never appeared.
 *
 * One branch, two apps, opposite halves discarded, and `check:twins` could see
 * neither: `async-boundary.tsx` is EXCLUDED from that check because the two apps
 * use different loader components. An exclusion granted for a rendering
 * difference had come to cover a behavioural one — which is why this file exists
 * on BOTH sides now rather than only where the bug was reported.
 *
 * The rule both halves encode: the caller's line says WHAT FAILED AND WHAT IT
 * MEANS HERE, the API's says WHY, and neither substitutes for the other.
 */
describe('AsyncBoundary error state', () => {
  it("shows the API's own message instead of swallowing it", () => {
    /*
     * The portal's half of the bug. A client whose withdrawal read fails for a
     * stated reason should be told the reason — "Something went wrong" is what
     * makes a support ticket out of a self-explanatory refusal.
     */
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        error={{ response: { data: { message: 'Amount exceeds your available balance.' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Amount exceeds your available balance.')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("keeps the screen's own sentence when it has one, with the API's beneath", () => {
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Could not load your wallet."
        error={{ response: { data: { message: 'Internal server error' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText('Could not load your wallet.')).toBeInTheDocument();
    expect(screen.getByText('Internal server error')).toBeInTheDocument();
  });

  it('falls back to the generic line when the API said nothing at all', () => {
    // A dropped connection never reached the API, so there is no message and no
    // request id — the generic sentence is the honest one here.
    renderWithProviders(
      <AsyncBoundary status="error" label="Loading" endpoints={[]} onRetry={vi.fn()}>
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('does not print the same sentence twice', () => {
    renderWithProviders(
      <AsyncBoundary
        status="error"
        label="Loading"
        endpoints={[]}
        onRetry={vi.fn()}
        errorMessage="Wallet unavailable."
        error={{ response: { data: { message: 'Wallet unavailable.' } } }}
      >
        <p>{'never rendered'}</p>
      </AsyncBoundary>,
    );

    expect(screen.getAllByText('Wallet unavailable.')).toHaveLength(1);
  });
});
