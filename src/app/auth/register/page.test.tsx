import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RegisterPage from './page';

/**
 * Account creation.
 *
 * The behaviour worth pinning is that registration does NOT sign the client in.
 * It answers `{ message, userId }` and the account stays unverified until the
 * emailed link is followed — this screen shows the message and then sends the
 * client to sign-in on a timer. The backend briefly documented this route as
 * returning auth tokens, which was wrong; a test here is what stops the frontend
 * quietly growing code that expects a session.
 */

const { register } = vi.hoisted(() => ({ register: vi.fn() }));
const push = vi.fn();

// Both exports: lib/api/index.ts exposes `api` named AND as default, and this page
// uses the named one. Mocking only `default` leaves `api` undefined and the
// resulting TypeError is swallowed by the page's own catch.
vi.mock('@/lib/api', () => {
  const api = { auth: { register } };
  return { api, default: api };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function apiError(message: string, status = 409): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { message } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * Fake timers for EVERY test here, not just the one that advances the clock.
   *
   * A successful registration schedules `setTimeout(() => router.push(…), 3000)`
   * and nothing cancels it — unmounting the tree does not. Under real timers
   * that survives the test that created it and fires three seconds later, into
   * the next test, calling the module-level `push` mock that `clearAllMocks`
   * had just reset. The test that then asserted "no redirect yet" saw one.
   *
   * It reported itself as a behaviour change in the page, which is the
   * expensive part: the leak is invisible in the test that causes it and only
   * ever fails a LATER one, and which one depends on how fast the suite runs.
   * (It surfaced when a wrapper component shifted the timing by a few hundred
   * milliseconds; the leak had been there all along.)
   *
   * Faking the clock in every test makes every pending timer fake, and
   * `useRealTimers()` in afterEach discards them. `shouldAdvanceTime` keeps
   * userEvent's own delays working.
   */
  vi.useFakeTimers({ shouldAdvanceTime: true });
  register.mockResolvedValue({
    message: 'Registration successful. Please check your email to verify your account.',
    userId: 'u-new',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function fillAndSubmit(over: Partial<Record<string, string>> = {}) {
  const user = userEvent.setup();
  renderWithProviders(<RegisterPage />);
  await user.type(await screen.findByLabelText(/first name/i), over.firstName ?? 'John');
  await user.type(screen.getByLabelText(/last name/i), over.lastName ?? 'Doe');
  await user.type(screen.getByLabelText(/email/i), over.email ?? 'new@oxshare.com');
  await user.type(screen.getByLabelText(/password/i), over.password ?? 'Passw0rd!');
  await user.click(screen.getByRole('button', { name: /complete registration/i }));
  return user;
}

describe('portal registration', () => {
  it('sends exactly the four fields the endpoint accepts', async () => {
    await fillAndSubmit();

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    // forbidNonWhitelisted is on server-side, so an extra property here is a 400.
    expect(register).toHaveBeenCalledWith({
      email: 'new@oxshare.com',
      password: 'Passw0rd!',
      firstName: 'John',
      lastName: 'Doe',
    });
  });

  it('shows the API message and does NOT treat the client as signed in', async () => {
    await fillAndSubmit();

    expect(await screen.findByText(/check your email to verify/i)).toBeInTheDocument();
    // No session exists yet, so nothing may navigate to a private area.
    expect(push).not.toHaveBeenCalledWith('/dashboard');
  });

  it('sends the client to sign-in after showing the message', async () => {
    await fillAndSubmit();

    await waitFor(() => expect(register).toHaveBeenCalled());
    await screen.findByText(/check your email to verify/i);

    // The redirect is deliberately delayed so the message is readable.
    expect(push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });

  it('treats a taken address exactly like a new one', async () => {
    /*
     * The API no longer answers 409 for an address that already has an account —
     * that made registration a membership oracle, and anyone could test an
     * address list to learn who banks here. It now returns the same message as a
     * real signup and emails the EXISTING account holder instead.
     *
     * So this screen must show no difference either. A UI that said "already
     * registered" would reintroduce, on the client, the leak the API just closed
     * — the same mistake `forgot-password/page.tsx` is careful not to make.
     */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Note the absent `userId`: no account was created, and returning the
    // existing one's id would hand back the fact the API is hiding.
    register.mockResolvedValueOnce({
      message: 'Registration successful. Please check your email to verify your account.',
    });

    await fillAndSubmit();

    expect(await screen.findByText(/check your email to verify/i)).toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();

    vi.advanceTimersByTime(3000);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/login'));
  });

  it('surfaces a rejected password without clearing the form', async () => {
    register.mockRejectedValueOnce(apiError('password must be longer than 8 characters', 400));

    await fillAndSubmit({ password: 'short' });

    expect(await screen.findByText(/longer than 8 characters/i)).toBeInTheDocument();
    // Re-typing everything after one bad field is the fastest way to lose a signup.
    expect(screen.getByLabelText(/first name/i)).toHaveValue('John');
    expect(screen.getByLabelText(/email/i)).toHaveValue('new@oxshare.com');
  });

  it('returns the button to its idle state after a failure', async () => {
    register.mockRejectedValueOnce(apiError('password must be longer than 8 characters', 400));

    await fillAndSubmit();

    await screen.findByText(/longer than 8 characters/i);
    expect(screen.getByRole('button', { name: /complete registration/i })).toBeEnabled();
  });

  it('does not call the API with an incomplete form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);

    await user.type(await screen.findByLabelText(/first name/i), 'John');
    await user.click(screen.getByRole('button', { name: /complete registration/i }));

    // As on sign-in, the inputs are `required`, so the browser blocks submit and
    // the guarantee to assert is "no request" rather than a specific message.
    expect(register).not.toHaveBeenCalled();
  });
});
