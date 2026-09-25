import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RegisterPage from './page';

/**
 * ONE REGISTRATION PER REGISTRATION.
 *
 * Reported from production: "after I press register, if I click it again it
 * works and sends many emails to the address before it takes me to the login
 * page."
 *
 * The button was disabled while the request was IN FLIGHT, which looked like
 * enough. It was not: on success the handler cleared that flag and then waited
 * six seconds — showing the confirmation before navigating — so for those six
 * seconds the form was live again with the same details still in it. Every
 * further click was another `POST /auth/register` and another verification
 * email to the same person.
 *
 * Worth more than the tidiness: each click also spends the account's
 * registration allowance, and a client who clicks five times gets five
 * near-identical emails and has to work out which link is real.
 */

const register = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { auth: { register } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

async function fillTheForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), 'Ada');
  await user.type(screen.getByLabelText(/last name/i), 'Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.test');
  await user.type(screen.getByLabelText(/^password/i), 'A-strong-passphrase-1');
}

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ message: 'Check your inbox.' });
});

describe('pressing Register more than once', () => {
  it('registers ONCE, however many times the button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);

    const submit = screen.getByRole('button', {
      name: /^create account$|creating your account/i,
    });
    await user.click(submit);
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));

    // The window the bug lived in: registered, confirmation shown, redirect not
    // yet fired. The form is still on screen.
    await user.click(submit).catch(() => undefined);
    await user.click(submit).catch(() => undefined);

    expect(
      register,
      'a second registration was sent — that is a second verification email to the same person',
    ).toHaveBeenCalledTimes(1);
  });

  it('leaves the button disabled after success, until the redirect', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);

    await user.click(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
    );
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));

    expect(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
      'the form invited a click that could only do harm',
    ).toBeDisabled();
  });

  it('stays usable after a FAILED attempt, which is not the same thing', async () => {
    /*
     * The counter-case that stops the fix going too far. A registration that
     * was refused — a taken address, a weak password — must be retryable, or
     * the client is stranded on a form they cannot resubmit.
     */
    register.mockRejectedValueOnce({ response: { data: { message: 'That email is taken.' } } });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);

    await user.click(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
    );
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));

    expect(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
      'a refused registration left the client unable to try again',
    ).toBeEnabled();
  });
});

describe('after a successful registration', () => {
  it('goes straight to the code screen, with the address in this tab and not in the URL', async () => {
    /*
     * The client's request (25 Sep 2026): register, type the emailed code, be
     * signed in. So success is a navigation to the code screen — not a banner
     * and a timed redirect to sign-in, which is what this used to do.
     *
     * The address rides in sessionStorage because an email in a query string
     * reaches history, Referer headers and access logs.
     */
    sessionStorage.clear();
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);

    await user.click(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const [destination] = push.mock.calls[0] as [string];
    expect(destination).toBe('/auth/confirm-email?from=register');
    expect(destination, 'the address leaked into the URL').not.toContain('ada');

    const stored = JSON.parse(sessionStorage.getItem('oxshare.pending-email') ?? 'null') as {
      email: string;
      sentAt: number;
    } | null;
    expect(stored?.email).toBe('ada@example.test');
    expect(typeof stored?.sentAt).toBe('number');
  });

  it('sends nobody anywhere, and remembers nothing, when the registration is refused', async () => {
    sessionStorage.clear();
    register.mockRejectedValueOnce({ response: { data: { message: 'Registration failed.' } } });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);

    await user.click(
      screen.getByRole('button', { name: /^create account$|creating your account/i }),
    );
    await screen.findByText(/registration failed/i);

    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('oxshare.pending-email')).toBeNull();
  });
});
