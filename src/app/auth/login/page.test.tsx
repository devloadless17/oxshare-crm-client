import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LoginPage from './page';

/**
 * Portal sign-in — the highest-traffic screen in the app, and it had no tests.
 *
 * The behaviour worth pinning is the unverified-email branch. A client who
 * registers and then tries to sign in before clicking the emailed link gets a
 * specific rejection, and this screen is supposed to notice that and offer to
 * resend the link. That detection is a string match on the API's message, so it is
 * exactly the kind of thing that breaks silently when someone rewords the backend
 * error — and the symptom is a client stuck at the door with no way through.
 */

const { login, resendVerification } = vi.hoisted(() => ({
  login: vi.fn(),
  resendVerification: vi.fn(),
}));

const push = vi.fn();
const refresh = vi.fn();
/** True if `router.push` ran before the session was refetched — it must not. */
let pushedBeforeRefetch = false;
const refetchUser = vi.fn(() => {
  pushedBeforeRefetch = push.mock.calls.length > 0;
  return Promise.resolve();
});

// Both exports: lib/api/index.ts exposes `api` as a named export AND as default,
// and this page uses the named one. Mocking only `default` left `api` undefined,
// and the resulting TypeError was swallowed by the page's own catch — which looks
// exactly like a failed sign-in.
vi.mock('@/lib/api', () => {
  const api = { auth: { login, resendVerification } };
  return { api, default: api };
});

const replace = vi.fn();
/**
 * `searchParams` is a `let` because two behaviours read it: the page navigates
 * to `?next=` after a successful sign-in, and `RedirectIfAuthenticated` reads
 * the same value when it bounces a client who already has a session.
 */
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace }),
  useSearchParams: () => searchParams,
}));

// `user: null, isLoading: false` is "settled, and signed out" — the state this
// screen exists for. Omitting them made `user` undefined, which the reverse
// gate reads as a live session and redirects.
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ refetchUser, user: null, isLoading: false }),
}));

function apiError(message: string, status = 401, code?: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message, ...(code ? { code } : {}) } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  pushedBeforeRefetch = false;
  searchParams = new URLSearchParams();
  // No tokens in the body — the session arrives as httpOnly cookies on this
  // very response (R-3.2), and AuthTokensResponseDto no longer declares them.
  login.mockResolvedValue({ user: { id: 'u1', email: 'client@oxshare.com' }, emailVerified: true });
  resendVerification.mockResolvedValue({ message: 'Verification email sent.' });
});

describe('the session is refetched before navigating', () => {
  /*
   * The admin twin has always done this and asserts the ordering; the portal did
   * not, and the consequence is specific to how UserProvider is mounted.
   *
   * It sits in the root layout, so a client-side `router.push` does NOT remount
   * it — and its `['user','me']` query has already settled as a 401, with
   * `retry: false` and a five-minute `staleTime`. Without an explicit refetch the
   * portal lands on /dashboard with `user === null`, rendering the signed-in
   * shell with no identity in it until a window focus happens to refresh it.
   * `router.refresh()` does not help: it re-fetches server components and never
   * touches the React Query cache.
   */
  it('refetches the user, then pushes', async () => {
    await fillAndSubmit();

    expect(refetchUser).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/dashboard');
    // Ordering, not just occurrence: pushing first is what leaves the dashboard
    // rendering an empty identity. Recorded from inside the refetch rather than
    // compared through `invocationCallOrder`, whose entries are
    // possibly-undefined under the build's stricter checks — and this states the
    // property directly.
    expect(pushedBeforeRefetch).toBe(false);
  });

  it('does not refetch or navigate when the credentials are refused', async () => {
    login.mockRejectedValueOnce(apiError('Invalid email or password.'));
    await fillAndSubmit();

    expect(refetchUser).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

async function fillAndSubmit(email = 'client@oxshare.com', password = 'client123') {
  const user = userEvent.setup();
  renderWithProviders(<LoginPage />);
  await user.type(await screen.findByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  return user;
}

describe('portal sign-in', () => {
  it('signs in and lands the client on the dashboard', async () => {
    await fillAndSubmit();

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(login).toHaveBeenCalledWith({
      email: 'client@oxshare.com',
      password: 'client123',
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('returns the client to the page they were bounced off', async () => {
    /*
     * The proxy attaches `?next=` when it redirects an unauthenticated visitor;
     * this is the other half. Without it, a client who followed a link to
     * /wallet — or whose session expired on /kyc/step/3 — signed in and landed
     * on the dashboard, having to find their way back by hand, mid-task.
     */
    searchParams = new URLSearchParams('next=%2Fkyc%2Fstep%2F3');
    await fillAndSubmit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/kyc/step/3'));
  });

  it('refuses to be an open redirect, even for a link a client was sent', async () => {
    /*
     * `next` arrives in the URL, so anybody can mail a client
     * `/auth/login?next=https://evil.example/login`. Following it would deliver
     * them to a phishing page in the instant AFTER they typed their password
     * into the real one — which is why the value is checked where it is used
     * and not only where we generate it.
     */
    searchParams = new URLSearchParams('next=https://evil.example/login');
    await fillAndSubmit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('evil.example'));
  });

  it('does not call the API with an incomplete form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText(/email address/i), 'client@oxshare.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    /*
     * The guarantee asserted here is "no request", not "our message appears".
     *
     * Both inputs carry `required`, so the browser's own validation blocks the
     * submit event and handleSubmit never runs — which means the page's
     * `if (!email || !password)` branch is unreachable through the UI. That branch
     * is worth keeping as belt-and-braces if `required` is ever removed, but a test
     * asserting its message would be testing dead code and would fail for the
     * wrong reason.
     */
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the real reason a sign-in was rejected', async () => {
    login.mockRejectedValueOnce(apiError('Invalid credentials.'));

    await fillAndSubmit();

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('offers to resend the link when the email is not verified', async () => {
    /*
     * Detected by the envelope's `code`, not by its wording.
     *
     * This screen used to match `message.includes('verify your email')`, and
     * this test asserted that coupling — so it guarded the defect rather than
     * the behaviour. The message here is deliberately NOT English: the whole
     * point is that the decision survives translation, which FSD §10 and D-16
     * require.
     */
    login.mockRejectedValueOnce(
      apiError('يرجى التحقق من عنوان بريدك الإلكتروني', 403, 'EMAIL_NOT_VERIFIED'),
    );

    await fillAndSubmit();

    expect(await screen.findByRole('button', { name: /resend/i })).toBeInTheDocument();
  });

  it('does NOT offer resend for an unrelated refusal', async () => {
    // The other half of the substring match: any message that happened to
    // contain the phrase — a suspended-account notice quoting it, a reworded
    // 403 — offered a resend that would not help. A code cannot be matched by
    // accident.
    login.mockRejectedValueOnce(
      apiError('Your account has been suspended. Please contact support.', 403, 'FORBIDDEN'),
    );

    await fillAndSubmit();

    expect(await screen.findByText(/suspended/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend/i })).toBeNull();
  });

  it('resends the verification link on request', async () => {
    login.mockRejectedValueOnce(
      apiError('Please verify your email before signing in.', 403, 'EMAIL_NOT_VERIFIED'),
    );
    const user = await fillAndSubmit();

    await user.click(await screen.findByRole('button', { name: /resend/i }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('client@oxshare.com'));
  });

  it('does not strand the client on a spinner when sign-in fails', async () => {
    login.mockRejectedValueOnce(apiError('Invalid credentials.'));

    await fillAndSubmit();

    await screen.findByText(/invalid credentials/i);
    // The button must return to its idle label, or the form looks permanently busy.
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });
});
