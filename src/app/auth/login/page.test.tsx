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

// Both exports: lib/api/index.ts exposes `api` as a named export AND as default,
// and this page uses the named one. Mocking only `default` left `api` undefined,
// and the resulting TypeError was swallowed by the page's own catch — which looks
// exactly like a failed sign-in.
vi.mock('@/lib/api', () => {
  const api = { auth: { login, resendVerification } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

function apiError(message: string, status = 401, code?: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message, ...(code ? { code } : {}) } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  login.mockResolvedValue({ access_token: 't', refresh_token: 'r' });
  resendVerification.mockResolvedValue({ message: 'Verification email sent.' });
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
