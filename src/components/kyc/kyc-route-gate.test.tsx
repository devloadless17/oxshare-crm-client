import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KycRouteGate } from './kyc-route-gate';

/**
 * The client-side KYC route gate — one predicate, three routes, no loop.
 *
 * Replaced the server-side status read, which forwarded the portal host's
 * cookie jar and so could never see the API's session off localhost (see the
 * component header). What is pinned here: nothing paints while the status is
 * in flight, a refused state redirects exactly once, and an allowed state
 * renders the page.
 */
const replace = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => ({ status: undefined as string | undefined, isLoading: true }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/hooks/use-kyc-access', () => ({ useKycAccess: () => access }));

beforeEach(() => {
  replace.mockClear();
  access.status = undefined;
  access.isLoading = true;
});

describe('KycRouteGate', () => {
  it('paints a loader and decides nothing while the status is in flight', () => {
    render(
      <KycRouteGate allow={() => true} redirectTo="/kyc/submitted">
        <p>{'the form'}</p>
      </KycRouteGate>,
    );
    expect(screen.queryByText('the form')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects once, and never paints the page, when the state is refused', () => {
    access.status = 'approved';
    access.isLoading = false;
    render(
      <KycRouteGate allow={(s) => s !== 'approved'} redirectTo="/kyc/submitted">
        <p>{'the form'}</p>
      </KycRouteGate>,
    );
    expect(screen.queryByText('the form')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/kyc/submitted');
  });

  it('renders the page when the state is allowed', () => {
    access.status = 'rejected';
    access.isLoading = false;
    render(
      <KycRouteGate allow={(s) => s === 'rejected'} redirectTo="/kyc/step/1">
        <p>{'the outcome'}</p>
      </KycRouteGate>,
    );
    expect(screen.getByText('the outcome')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('treats a status that never loaded as "not started" — the open-form default', () => {
    access.status = undefined;
    access.isLoading = false;
    render(
      <KycRouteGate allow={(s) => s === 'not_started'} redirectTo="/kyc/submitted">
        <p>{'the form'}</p>
      </KycRouteGate>,
    );
    expect(screen.getByText('the form')).toBeInTheDocument();
  });
});
