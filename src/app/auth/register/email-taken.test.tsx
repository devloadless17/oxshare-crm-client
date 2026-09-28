import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import RegisterPage from './page';

/**
 * SIGN-UP WITH AN ADDRESS THAT ALREADY HAS AN ACCOUNT — beside `page.test.tsx`,
 * which holds the rest of the form, because together they pass the file-size
 * limit. The setup below is that file's, copied: `vi.mock` is per file.
 */

const register = vi.hoisted(() => vi.fn());
const emailAvailable = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const options = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { auth: { register, emailAvailable } },
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

/** Which fields the SERVER requires, and when — served beside the lists. */
const REQUIRED = {
  registration: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'phone', 'country'],
  verification: [
    'firstName',
    'lastName',
    'dateOfBirth',
    'nationality',
    'phone',
    'country',
    'address',
    'city',
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({ message: 'Check your inbox.' });
  emailAvailable.mockResolvedValue(true);
  sessionStorage.clear();
  options.mockResolvedValue({
    countries: ['Lebanon', 'United Arab Emirates'],
    nationalities: ['Emirati', 'Lebanese'],
    required: REQUIRED,
  });
});

/*
 * The owner's ruling (28 Sep 2026): an address that already has an account is
 * told so ON THIS FORM, with a password reset and sign-in one click away. It
 * used to go to a code screen for a code that never came, while an email said
 * the opposite, and clients found that confusing.
 */
describe('an address that already has an account', () => {
  it('is told on the FIRST step, with a password reset and sign-in, and goes no further', async () => {
    emailAvailable.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    const panel = await screen.findByTestId('email-taken');
    expect(panel).toHaveTextContent(/this email is already in use/i);
    expect(panel).toHaveTextContent('ada@example.test');
    expect(within(panel).getByRole('link', { name: /reset password/i })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    );
    expect(within(panel).getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    // Never the details step, never a registration, never the code screen.
    expect(screen.queryByText(/step 2 of 2/i)).not.toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(emailAvailable).toHaveBeenCalledWith('ada@example.test');
  });

  /*
   * The owner's call (28 Sep 2026): the notice sat between the email and the
   * password inputs and split the form. It is the form's error now — last, in
   * red — and the email input turns red with it, so which field it is about is
   * not lost by the move.
   */
  it('shows the notice at the END of the form, in red, and marks the email input', async () => {
    emailAvailable.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    const cont = screen.getByRole('button', { name: /^continue$/i });
    await user.click(cont);

    const panel = await screen.findByTestId('email-taken');
    const password = screen.getByLabelText(/^password$/i);
    // After Continue and after the password input — never between the fields.
    expect(cont.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(password.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.parentElement?.lastElementChild).toBe(panel);
    expect(panel.className).toMatch(/border-destructive/);
    expect(panel.className).toMatch(/bg-destructive/);

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email.getAttribute('aria-describedby')).toContain(panel.id);

    // Editing the address clears both.
    await user.type(email, 'x');
    expect(screen.queryByTestId('email-taken')).not.toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  it('hands the address to the password reset, so it is not typed again', async () => {
    emailAvailable.mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(await screen.findByRole('link', { name: /reset password/i }));
    expect(sessionStorage.getItem('oxshare.handed-email')).toBe('ada@example.test');
  });

  it('goes back to the first step with the same panel when the final submit is refused', async () => {
    // Taken between the first step's check and the submit.
    register.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email already has an OxShare account.',
          fields: { email: 'This email already has an OxShare account.' },
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillTheForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('email-taken')).toBeInTheDocument();
    expect(screen.queryByText(/step 2 of 2/i)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('lets them use a different address instead', async () => {
    emailAvailable.mockResolvedValueOnce(false).mockResolvedValue(true);
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    await user.click(await screen.findByRole('button', { name: /use a different email/i }));

    expect(screen.queryByTestId('email-taken')).not.toBeInTheDocument();
    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveValue('');
    await user.type(email, 'ada.new@example.test');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByText(/step 2 of 2/i)).toBeInTheDocument();
  });

  it('does not stop a sign-up when the check itself fails — the submit asks again', async () => {
    emailAvailable.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(await screen.findByText(/step 2 of 2/i)).toBeInTheDocument();
  });
});
