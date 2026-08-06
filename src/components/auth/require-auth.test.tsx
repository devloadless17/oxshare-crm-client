import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RequireAuth } from './require-auth';

/**
 * The gap `proxy.ts` cannot close from where it stands.
 *
 * The proxy decides on the PRESENCE of a refresh cookie — it has no signing key,
 * so it cannot do better — and that left a forged or expired cookie rendering
 * the whole signed-in portal:
 *
 *     curl -H 'Cookie: oxshare_crm_portal_rt=totally-forged' localhost:3000/dashboard
 *     → 200, sidebar, topbar, and the placeholder identity "Client User"
 *
 * `/auth/me` is the only unforgeable answer. These assert that this component
 * waits for it and paints nothing private before it arrives.
 */

const { replace, useUser, usePathname, get } = vi.hoisted(() => ({
  replace: vi.fn(),
  useUser: vi.fn(),
  usePathname: vi.fn(),
  get: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname }));
vi.mock('@/context/UserContext', () => ({ useUser }));
// `/kyc/status` feeds the KYC gate on the money routes. Mocked at the client
// rather than at `@/lib/api`, because that is what `require-auth.tsx` imports —
// mocking the wrong one of the two leaves the real module in place, and its own
// failure then reads as a broken gate rather than a broken mock.
vi.mock('@/lib/api/client', () => ({ apiClient: { get } }));

const PRIVATE = 'account balance';

beforeEach(() => {
  vi.clearAllMocks();
  usePathname.mockReturnValue('/dashboard');
  get.mockResolvedValue({ data: { status: 'approved' } });
});

function renderGate() {
  return renderWithProviders(
    <RequireAuth>
      <div>{PRIVATE}</div>
    </RequireAuth>,
  );
}

describe('RequireAuth', () => {
  it('renders the private tree for a confirmed session', () => {
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    expect(screen.getByText(PRIVATE)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders NOTHING private for a cookie the server does not honour', async () => {
    // The reported bug, stated as an assertion. `user === null` after the query
    // settles is what a forged, expired or revoked cookie looks like from here.
    useUser.mockReturnValue({ user: null, isLoading: false, sessionState: 'signed-out' });
    renderGate();

    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/login?next=%2Fdashboard'));
  });

  it('holds the paint back while the answer is in flight', () => {
    /*
     * Rendering children during `isLoading` would show the signed-in shell to
     * everyone, including the visitor about to be redirected — the same bug,
     * just briefer. And redirecting during `isLoading` would be the OTHER
     * historical bug: acting on an unanswered question is what made onboarding
     * unreachable for every verified client once already.
     *
     * So: neither. Wait.
     */
    useUser.mockReturnValue({ user: null, isLoading: true, sessionState: 'loading' });
    renderGate();

    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('says what it is doing, for a screen reader too', () => {
    useUser.mockReturnValue({ user: null, isLoading: true, sessionState: 'loading' });
    renderGate();

    // A bare spinner tells someone using a screen reader nothing, and the
    // outcome here is a redirect to sign in for some of the people who hear it.
    expect(screen.getByRole('status')).toHaveTextContent(/session/i);
  });

  it('remembers where the visitor was going', async () => {
    // Landing every bounced client on /dashboard threw away their intent. A
    // session that expires mid-task should resume it, not restart it.
    useUser.mockReturnValue({ user: null, isLoading: false, sessionState: 'signed-out' });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('next=')));
  });
});

/**
 * `EmailVerifiedGuard` sits on the backend's KYC controller AND its payments
 * controller. The portal gated KYC alone, so /deposit, /withdraw and
 * /transactions rendered a complete money-movement UI to a client whose every
 * submission the API had already decided to refuse with `EMAIL_NOT_VERIFIED`.
 */
describe('RequireAuth — the verified-email routes', () => {
  it('sends an unverified client off a route the API would refuse', async () => {
    usePathname.mockReturnValue('/withdraw');
    useUser.mockReturnValue({ user: { id: 'u1', emailVerified: false }, isLoading: false });
    renderGate();

    // Never renders the form. Letting someone enter an amount and a destination
    // and THEN refusing is worse than not offering it.
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verify-email/pending'));
  });

  it('still covers KYC, which is where this gate started', async () => {
    usePathname.mockReturnValue('/kyc/step/1');
    useUser.mockReturnValue({ user: { id: 'u1', emailVerified: false }, isLoading: false });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verify-email/pending'));
  });

  it('does NOT demand verification where the backend does not', async () => {
    // A session is enough to see your own balance. Gating /dashboard or /wallet
    // on a verified address would lock an unverified client out of their own
    // account — the mirror of the bug this list exists to fix.
    usePathname.mockReturnValue('/dashboard');
    useUser.mockReturnValue({ user: { id: 'u1', emailVerified: false }, isLoading: false });
    renderGate();

    expect(screen.getByText(PRIVATE)).toBeInTheDocument();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('lets a verified client through a gated route', async () => {
    usePathname.mockReturnValue('/withdraw');
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true, verificationLevel: 1 },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    // The regression this whole family of gates keeps re-learning: redirecting
    // the people who ARE allowed. It has happened once already, on /kyc.
    //
    // `verificationLevel: 1` is in the fixture because /withdraw now carries a
    // SECOND gate — see the KYC block below. Email-verified alone is no longer
    // the whole answer on a money route, and a fixture that says otherwise
    // would assert the old rule while passing.
    await waitFor(() => expect(screen.getByText(PRIVATE)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});

/**
 * The KYC gate on the money routes.
 *
 * The buttons that reach /deposit and /withdraw already refuse to navigate an
 * unapproved client and say why. That is a courtesy in front of a link, and a
 * link is not a gate: these URLs are typed, bookmarked and shared, and the
 * routes behind them rendered a complete money-movement form to someone the
 * payments API had already decided to refuse.
 *
 * `lib/kyc-access.test.ts` owns the RULE. These own the wiring: which routes,
 * and what happens while the answer is still in flight.
 */
describe('RequireAuth — the KYC-gated money routes', () => {
  it('sends an unapproved client off /deposit', async () => {
    usePathname.mockReturnValue('/deposit');
    get.mockResolvedValue({ data: { status: 'not_started' } });
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc'));
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });

  it('sends one off /withdraw while the application is still under review', async () => {
    // Submitted is not approved. The money screens open on the APPROVAL, not on
    // the client having done their part — the API draws the line in the same
    // place, and a form that submits into a refusal is worse than a wait.
    usePathname.mockReturnValue('/withdraw');
    get.mockResolvedValue({ data: { status: 'submitted' } });
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/kyc'));
  });

  it('lets an approved client through', async () => {
    usePathname.mockReturnValue('/deposit');
    get.mockResolvedValue({ data: { status: 'approved' } });
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    await waitFor(() => expect(screen.getByText(PRIVATE)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('accepts the profile signal when the KYC record disagrees', async () => {
    // `verificationLevel` and `status` are written by different backend paths.
    // Requiring both to agree locks a client whose approval has landed on one
    // and not yet the other out of their own money — see lib/kyc-access.ts.
    usePathname.mockReturnValue('/deposit');
    get.mockResolvedValue({ data: { status: 'not_started' } });
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true, verificationLevel: 1 },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    await waitFor(() => expect(screen.getByText(PRIVATE)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it('neither admits nor bounces while the status is in flight', () => {
    /*
     * The trap this codebase has fallen into twice: acting on an unanswered
     * question. Redirecting here would bounce approved clients on every cold
     * load; rendering would flash the withdrawal form at people about to be
     * sent away. So: neither, exactly as for the profile itself.
     */
    usePathname.mockReturnValue('/withdraw');
    get.mockReturnValue(new Promise(() => {}));
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does NOT gate the reading screens', async () => {
    // /wallet and /transactions show a client their own money. Gating those on
    // KYC would hide the balance from the person it belongs to, which is the
    // mirror of the bug the gate exists to fix.
    usePathname.mockReturnValue('/wallet');
    get.mockResolvedValue({ data: { status: 'not_started' } });
    useUser.mockReturnValue({
      user: { id: 'u1', emailVerified: true },
      isLoading: false,
      sessionState: 'signed-in',
    });
    renderGate();

    expect(screen.getByText(PRIVATE)).toBeInTheDocument();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});

/**
 * An API that did not answer is not a client who is signed out.
 *
 * This gate read `!isLoading && user === null`, and a 500, a timeout or one
 * dropped request produced exactly that — so an offline moment on the FIRST
 * `/auth/me` of a page load redirected a signed-in client to the sign-in
 * screen. It is reachable mid-KYC, where the same code path also used to wipe
 * the half-filled form.
 *
 * The distinction has to be asserted from BOTH sides, because a fix that simply
 * stopped redirecting would be worse than the bug: it would paint the private
 * tree over a profile the portal does not have.
 */
describe('RequireAuth — an unreachable API', () => {
  const unreachable = { user: null, isLoading: false, sessionState: 'unreachable' as const };

  it('does NOT send the client to sign in', async () => {
    useUser.mockReturnValue({ ...unreachable, refetchUser: vi.fn() });
    renderGate();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The load-bearing assertion. Redirecting here is the defect.
    expect(replace).not.toHaveBeenCalled();
  });

  it('does NOT render the private tree either', async () => {
    useUser.mockReturnValue({ ...unreachable, refetchUser: vi.fn() });
    renderGate();

    await screen.findByRole('alert');
    expect(screen.queryByText(PRIVATE)).not.toBeInTheDocument();
  });

  it('says the session is intact, and offers a retry that re-asks', async () => {
    const refetchUser = vi.fn();
    useUser.mockReturnValue({ ...unreachable, refetchUser });
    renderGate();

    // Telling the client their session is FINE is the half that stops them
    // trying to sign in again — which on the same bad connection fails too, and
    // then meets the login rate limit.
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(refetchUser).toHaveBeenCalledTimes(1);
  });

  it('still redirects when the API actually SAID no', async () => {
    useUser.mockReturnValue({
      user: null,
      isLoading: false,
      sessionState: 'signed-out',
      refetchUser: vi.fn(),
    });
    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0]?.[0])).toContain('/auth/login');
  });
});
