import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { RedirectIfAuthenticated } from './redirect-if-authenticated';

/**
 * The direction of gating this app shipped without.
 *
 * `/auth/login` served its form to a client holding a live session — confirmed
 * against the running backend, not inferred. Submitting it mints a SECOND
 * thirty-day refresh-token family over the first, and on the shared devices
 * this portal is often used from it puts a credential prompt in front of
 * whoever is already signed in.
 */

const { replace, useUser, searchParams } = vi.hoisted(() => ({
  replace: vi.fn(),
  useUser: vi.fn(),
  searchParams: { current: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams.current,
}));
vi.mock('@/context/UserContext', () => ({ useUser }));

const FORM = 'sign-in form';

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
});

function renderGate() {
  return renderWithProviders(
    <RedirectIfAuthenticated>
      <div>{FORM}</div>
    </RedirectIfAuthenticated>,
  );
}

describe('RedirectIfAuthenticated', () => {
  it('bounces a client who already has a session', async () => {
    useUser.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('serves the form to a visitor with no session', async () => {
    useUser.mockReturnValue({ user: null, isLoading: false });
    renderGate();

    expect(screen.getByText(FORM)).toBeInTheDocument();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('paints immediately rather than making every visitor wait', () => {
    /*
     * The opposite trade from `RequireAuth`, and deliberately so.
     *
     * This is the most-loaded page in the app and the overwhelming majority of
     * its visitors have no session, so a spinner over `/auth/me` returning 401
     * would tax the common case to correct a rare one the proxy has already
     * handled. The harms are not symmetric either: a flash of the sign-in form
     * for someone already signed in is cosmetic, while a flash of the portal
     * shell for a stranger is the bug the other gate exists to fix.
     */
    useUser.mockReturnValue({ user: null, isLoading: true });
    renderGate();

    expect(screen.getByText(FORM)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not act on an unanswered question', () => {
    // Redirecting while the profile is in flight is how a gate ends up bouncing
    // the people it is meant to admit — this codebase has done it once already.
    useUser.mockReturnValue({ user: { id: 'u1' }, isLoading: true });
    renderGate();

    expect(replace).not.toHaveBeenCalled();
  });

  it('returns them to where they were going', async () => {
    searchParams.current = new URLSearchParams('next=%2Fwallet');
    useUser.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/wallet'));
  });

  it('refuses to be an open redirect', async () => {
    /*
     * `next` arrives in the URL, so anyone can mail a client
     * `/auth/login?next=https://evil.example/login`. Following it would hand a
     * phishing page the moment immediately after a password was typed — which
     * is why this is checked at the point of USE and not only where we generate
     * it. `safeReturnTo` owns the reasoning; this is the wiring assertion.
     */
    searchParams.current = new URLSearchParams('next=https://evil.example/login');
    useUser.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});
