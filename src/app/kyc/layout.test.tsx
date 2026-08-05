import { describe, expect, it, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import KycLayout, { kycShellFor } from './layout';

/**
 * KYC requires a verified email — FR-CORE-15.
 *
 * The gate lives here rather than in `proxy.ts` because this is the first place
 * that knows the answer. In the proxy it read `emailVerified` off the JWT in
 * the session cookie, which worked only while the proxy was handed the ACCESS
 * token. Route gating then moved to the refresh cookie — correctly, so a
 * returning client with a valid 30-day session is renewed rather than bounced —
 * and the refresh token is signed from `{ sub, jti }`. The claim was
 * `undefined` for every client, so every client was redirected off onboarding,
 * verified ones included.
 */

const { replace, useUser } = vi.hoisted(() => ({ replace: vi.fn(), useUser: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/kyc/step/1',
}));
vi.mock('@/context/UserContext', () => ({ useUser }));
vi.mock('@/lib/api', () => {
  const api = { get: vi.fn().mockResolvedValue({ data: [] }) };
  return { api, default: api };
});

const asUser = (emailVerified: boolean) => ({
  user: { id: 'u1', emailVerified },
  isLoading: false,
});

beforeEach(() => vi.clearAllMocks());

describe('KYC email-verification gate', () => {
  it('lets a VERIFIED client through', async () => {
    useUser.mockReturnValue(asUser(true));
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    // The regression: this redirected every client, including this one.
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('redirects an UNVERIFIED client to the pending page', async () => {
    useUser.mockReturnValue(asUser(false));
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verify-email/pending'));
  });

  it('waits for the profile rather than redirecting on an unanswered question', async () => {
    // Redirecting while `/auth/me` is still in flight would bounce a verified
    // client on every cold load — the same visible bug by a different route.
    useUser.mockReturnValue({ user: null, isLoading: true });
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('sends a visitor with NO session to sign in, rather than rendering the wizard', async () => {
    /*
     * This used to assert the opposite — "no session is the route guard's job,
     * and it answers it before this renders" — which was true of a signed-out
     * visitor and false of the case that matters: a cookie the server does not
     * honour. `proxy.ts` gates on the PRESENCE of the refresh cookie because it
     * has no signing key, so a forged or expired one waved the visitor through
     * and this layout rendered the KYC wizard to them.
     *
     * `user === null` after the profile query settles IS that state, and it is
     * the one place the app can tell. The KYC wizard is also the worst place to
     * get this wrong: it is the screen that collects passport scans, selfies
     * and home addresses.
     */
    useUser.mockReturnValue({ user: null, isLoading: false });
    renderWithProviders(
      <KycLayout>
        <div>step content</div>
      </KycLayout>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('/auth/login')),
    );
  });
});

/**
 * Which chrome each KYC route wears, and — the point of the test — that the
 * answer depends on nothing that arrives over the network.
 *
 * The shell was chosen from the KYC status and the verification level. Both are
 * fetched, so the first paint committed to one shell and a later paint replaced
 * it: refreshing /kyc/submitted showed the bare wizard header and then swapped
 * in the whole portal, sidebar and topbar included. The sidebar visibly
 * disappeared and came back on every reload.
 *
 * `kycShellFor` takes a pathname and nothing else. These assert the mapping, and
 * they also mean that putting an async input back requires changing a signature
 * with tests written against it — which is the part a comment cannot enforce.
 */
describe('kycShellFor', () => {
  it('gives the terminal status page the portal, so the sidebar survives a refresh', () => {
    // The reported bug, stated as an assertion.
    expect(kycShellFor('/kyc/submitted')).toBe('portal');
  });

  it('gives onboarding steps the focused wizard', () => {
    // No sidebar here is deliberate: one job, no distractions.
    for (const path of ['/kyc/step/1', '/kyc/step/3', '/kyc/step/5']) {
      expect(kycShellFor(path)).toBe('wizard');
    }
  });

  it('keeps the sidebar through the /kyc redirect stub', () => {
    /*
     * /kyc reads the status and forwards to a step or to /kyc/submitted. Giving
     * it no chrome at all looked principled — it is not really a page — and it
     * reproduced the original bug one step removed: clicking "KYC Verification"
     * in the sidebar made the sidebar vanish for the length of the redirect and
     * reappear on the next page.
     *
     * Something is on screen during that redirect, and the only choice that
     * never removes chrome the client is already looking at is the chrome they
     * arrived with.
     */
    expect(kycShellFor('/kyc')).toBe('portal');
    expect(kycShellFor('/kyc/')).toBe('portal');
  });

  it('only ever ADDS focus, never removes surrounding UI and gives it back', () => {
    // The rule the two bugs above were both violations of. Entering a step drops
    // the sidebar deliberately; nothing else on this path may.
    const chromeless = ['/kyc', '/kyc/', '/kyc/submitted', '/kyc/submitted/'].filter(
      (p) => kycShellFor(p) !== 'portal',
    );
    expect(chromeless).toEqual([]);
  });

  it('is a pure function of the pathname', () => {
    // Same input, same answer, every time — no fetch, no clock, no user. This is
    // what makes the first paint correct rather than merely eventually correct.
    const twice = [kycShellFor('/kyc/submitted'), kycShellFor('/kyc/submitted')];
    expect(new Set(twice).size).toBe(1);
    expect(kycShellFor.length).toBe(1);
  });

  it('treats an unknown /kyc route as a portal page rather than crashing', () => {
    // Portal is the safe default: a stray path keeps the client's navigation
    // instead of stranding them in a wizard shell with no way out.
    expect(kycShellFor('/kyc/something-new')).toBe('portal');
  });
});
