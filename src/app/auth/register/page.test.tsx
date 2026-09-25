import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
const options = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { auth: { register } },
}));

// The server's lists (GET /profile/options) — the only choices the form offers.
vi.mock('@/lib/api/profile', () => ({ profileApi: { options } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

type User = ReturnType<typeof userEvent.setup>;

async function fillAccount(user: User) {
  await user.type(screen.getByLabelText(/first name/i), 'Ada');
  await user.type(screen.getByLabelText(/last name/i), 'Lovelace');
  await user.type(screen.getByLabelText(/email/i), 'ada@example.test');
  await user.type(screen.getByLabelText(/^password/i), 'A-strong-passphrase-1');
}

async function choose(user: User, label: RegExp, option: string) {
  await user.click(await screen.findByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fillDetails(user: User) {
  fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '1991-03-09' } });
  await choose(user, /nationality/i, 'Lebanese');
  // Choosing where they live starts the phone in that country's dial code.
  await choose(user, /country of residence/i, 'Lebanon');
  // Grouped, the way people type it — a spaced number is still a number.
  await user.type(screen.getByLabelText('Phone number'), '70 123 456');
  await user.type(screen.getByLabelText(/^city/i), 'Beirut');
}

/** Both steps, the way a client goes through them. */
async function fillTheForm(user: User) {
  await fillAccount(user);
  await user.click(screen.getByRole('button', { name: /^continue$/i }));
  await screen.findByText(/step 2 of 2/i);
  await fillDetails(user);
}

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ message: 'Check your inbox.' });
  options.mockResolvedValue({
    countries: ['Lebanon', 'United Arab Emirates'],
    nationalities: ['Emirati', 'Lebanese'],
  });
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

describe('two steps, one registration (the client’s request, 25 Sep 2026)', () => {
  it('will not leave the account step with a field empty, and says which', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/first name/i), 'Ada');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'false');
    expect(register).not.toHaveBeenCalled();
  });

  it('refuses a short password before the details, not after them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/first name/i), 'Ada');
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'short');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
  });

  it('will not register without the identity details, and marks each one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(await screen.findByRole('button', { name: /^create account$/i }));

    expect(register).not.toHaveBeenCalled();
    for (const label of [/date of birth/i, /nationality/i, /country of residence/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('sends the whole profile in ONE registration — what the verification opens with', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const [body] = register.mock.calls[0] as [Record<string, unknown>];
    // `undefined` is how an optional blank is omitted — JSON drops it.
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      password: 'A-strong-passphrase-1',
      dateOfBirth: '1991-03-09',
      nationality: 'Lebanese',
      phone: '+961 70 123 456',
      country: 'Lebanon',
      city: 'Beirut',
    });
  });

  it('never rewrites a number already typed when the country changes', async () => {
    // Choosing a country starts an EMPTY phone in its dial code; a number the
    // client typed is theirs, spaces and all.
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await choose(user, /country of residence/i, 'United Arab Emirates');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    const [body] = register.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ phone: '+961 70 123 456', country: 'United Arab Emirates' });
  });

  it('keeps everything typed when the client goes Back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(screen.getByLabelText(/^city/i)).toHaveValue('Beirut');
    expect(screen.getByLabelText(/date of birth/i)).toHaveValue('1991-03-09');
  });

  it('puts the server’s refusal under its field — on the step that shows it', async () => {
    /*
     * The server is the judge of names, dates and numbers (one set of rules
     * for every writer of the profile). A refused FIRST NAME found on submit
     * belongs to step 1, so the client is taken back there, to the box.
     */
    register.mockRejectedValueOnce({
      response: {
        data: {
          message: 'First name may contain only letters…',
          fields: {
            firstName: 'First name may contain only letters, spaces, hyphens and apostrophes.',
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await screen.findByText(/step 1 of 2/i);
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/may contain only letters, spaces/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps a DETAIL refusal visible after the account refusal is fixed', async () => {
    // Refused on both steps at once: the client is taken to the first, fixes
    // it, continues — and the second is still marked, not rediscovered later.
    register.mockRejectedValueOnce({
      response: {
        data: {
          fields: {
            firstName: 'First name may contain only letters, spaces, hyphens and apostrophes.',
            dateOfBirth: 'You must be at least 18 years old.',
          },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await screen.findByText(/step 1 of 2/i);
    await user.clear(screen.getByLabelText(/first name/i));
    await user.type(screen.getByLabelText(/first name/i), 'Adah');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/at least 18 years old/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('stays on the details step for a refusal that belongs there', async () => {
    register.mockRejectedValueOnce({
      response: { data: { fields: { dateOfBirth: 'You must be at least 18 years old.' } } },
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText(/at least 18 years old/i)).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date of birth/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('recovers on its own when only the prefetch failed', async () => {
    options.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByRole('combobox', { name: /nationality/i })).toBeEnabled();
  });

  it('says so when the lists could not be fetched — with a retry, never an empty drop-down', async () => {
    // Both the page's prefetch and the step's own read fail. (A prefetch that
    // fails ALONE is recovered silently when the step mounts — the case above.)
    options.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText(/could not load the list/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /nationality/i })).not.toBeInTheDocument();

    // The retry is the way on — the next fetch succeeds and the form appears.
    options.mockResolvedValue({ countries: ['Lebanon'], nationalities: ['Lebanese'] });
    await user.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByRole('combobox', { name: /nationality/i })).toBeEnabled();
  });
});
