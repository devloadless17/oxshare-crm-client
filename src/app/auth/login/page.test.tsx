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

function apiError(message: string, status = 401): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message } },
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
    // The backend's wording. This screen detects the case by matching on it, so
    // this test doubles as a guard on that coupling.
    login.mockRejectedValueOnce(apiError('Please verify your email before signing in.', 403));

    await fillAndSubmit();

    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /resend/i })).toBeInTheDocument();
  });

  it('resends the verification link on request', async () => {
    login.mockRejectedValueOnce(apiError('Please verify your email before signing in.', 403));
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
