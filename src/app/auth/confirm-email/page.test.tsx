import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import ConfirmEmailPage from './page';

/**
 * "Confirm your email" — the 6-digit code, and then the client is signed in.
 *
 * The server owns every rule that makes a six-digit code safe (keyed hash, five
 * attempts, fifteen minutes, single use — `email-code-signin.spec.ts` attacks
 * each against real Postgres). What only this screen can get wrong is WHERE a
 * confirmed client goes, WHAT it says after a refusal, and whether it ever asks
 * twice for one code.
 */

const verifyEmailCode = vi.hoisted(() => vi.fn());
const resendVerification = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));
const refetchUser = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  value: {
    user: null as null | { email: string; emailVerified: boolean },
    isLoading: false,
    hadSession: false,
  },
}));

vi.mock('@/lib/api', () => ({ api: { auth: { verifyEmailCode, resendVerification } } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams.value,
}));
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ ...session.value, refetchUser }),
}));

const EMAIL = 'ada@example.test';
const PENDING_KEY = 'oxshare.pending-email';

function remember(email = EMAIL, sentAt = Date.now()) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email, sentAt }));
}

const codeField = () => screen.getByLabelText(/verification code/i);
const invalid = (message = 'That code is incorrect or has expired.') => ({
  response: { status: 400, data: { code: 'EMAIL_CODE_INVALID', message } },
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  searchParams.value = new URLSearchParams('from=register');
  session.value = { user: null, isLoading: false, hadSession: false };
  verifyEmailCode.mockResolvedValue({ user: { email: EMAIL }, emailVerified: true });
  resendVerification.mockResolvedValue({ message: 'ok' });
  refetchUser.mockResolvedValue(undefined);
});

afterEach(() => {
  sessionStorage.clear();
});

describe('the right code', () => {
  it('confirms, signs in, and lands on "verify now or later" — session first, then the route', async () => {
    remember();
    const order: string[] = [];
    refetchUser.mockImplementation(() => {
      order.push('session');
      return Promise.resolve();
    });
    replace.mockImplementation((to: string) => order.push(`navigate ${to}`));
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);

    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    await user.type(codeField(), '482913');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(verifyEmailCode).toHaveBeenCalledWith({ email: EMAIL, code: '482913' });
    // The session BEFORE the navigation, or the next screen renders nobody.
    expect(order).toEqual(['session', 'navigate /onboarding']);
    // The hand-off is spent.
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('asks ONCE even when the sixth digit and a click on Continue race', async () => {
    remember();
    let settle: (value: unknown) => void = () => undefined;
    verifyEmailCode.mockImplementation(() => new Promise((resolve) => (settle = resolve)));
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);

    await user.type(codeField(), '482913');
    const submit = screen.getByRole('button', { name: /continue|confirming/i });
    await user.click(submit).catch(() => undefined);
    expect(verifyEmailCode).toHaveBeenCalledTimes(1);
    settle({ user: { email: EMAIL }, emailVerified: true });
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it('honours a same-origin ?next= from the sign-in screen', async () => {
    remember();
    searchParams.value = new URLSearchParams('from=login&next=%2Fwallet');
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);
    await user.type(codeField(), '482913');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/wallet'));
  });

  it('never follows a ?next= off the site — the open-redirect check', async () => {
    remember();
    searchParams.value = new URLSearchParams('from=login&next=https%3A%2F%2Fevil.example%2Flogin');
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);
    await user.type(codeField(), '482913');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
  });
});

describe('a wrong code', () => {
  it('says so, clears the boxes for the next try, and keeps the address', async () => {
    remember();
    verifyEmailCode.mockRejectedValueOnce(invalid());
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);

    await user.type(codeField(), '111111');
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect or has expired/i);
    expect(codeField()).toHaveValue('');
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it('after five, says the code is spent and stops offering it — until a new one is sent', async () => {
    remember(EMAIL, Date.now() - 60_000);
    verifyEmailCode.mockRejectedValue(invalid());
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);

    for (let attempt = 1; attempt <= 5; attempt++) {
      await waitFor(() => expect(codeField()).toBeEnabled());
      await user.type(codeField(), '111111');
      await waitFor(() => expect(verifyEmailCode).toHaveBeenCalledTimes(attempt));
    }
    expect(await screen.findByText(/too many incorrect attempts/i)).toBeInTheDocument();
    expect(codeField()).toBeDisabled();

    // A new code resets the budget, as the server does.
    await user.click(screen.getByRole('button', { name: /send a new code/i }));
    await waitFor(() => expect(codeField()).toBeEnabled());
    expect(resendVerification).toHaveBeenCalledWith(EMAIL);
    // Ready to type into — focus arrives AFTER the boxes are enabled again.
    await waitFor(() => expect(codeField()).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(/new code is on its way/i);
    expect(screen.queryByText(/too many incorrect attempts/i)).not.toBeInTheDocument();
  });

  it('shows the server’s own sentence for anything else — a throttle names its wait', async () => {
    remember();
    verifyEmailCode.mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again in 3 minutes.',
        },
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);
    await user.type(codeField(), '482913');
    expect(await screen.findByRole('alert')).toHaveTextContent('try again in 3 minutes');
  });
});

describe('who the screen is waiting on', () => {
  it('asks for the address when it has none — and sends NO code for it', async () => {
    searchParams.value = new URLSearchParams();
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);

    await user.type(screen.getByLabelText(/^email$/i), EMAIL);
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    // They may already hold a good code; a new one would kill it.
    expect(resendVerification).not.toHaveBeenCalled();
    // Nothing was sent, so there is no countdown to wait out.
    expect(screen.getByRole('button', { name: /send a new code/i })).toBeInTheDocument();
  });

  it('takes the address from an unconfirmed session', () => {
    searchParams.value = new URLSearchParams();
    session.value = {
      user: { email: 'moved@example.test', emailVerified: false },
      isLoading: false,
      hadSession: true,
    };
    renderWithProviders(<ConfirmEmailPage />);
    expect(screen.getByText('moved@example.test')).toBeInTheDocument();
  });

  it('sends a client whose address is already confirmed straight on', async () => {
    session.value = {
      user: { email: EMAIL, emailVerified: true },
      isLoading: false,
      hadSession: true,
    };
    renderWithProviders(<ConfirmEmailPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument();
  });

  it('counts the resend clock from the remembered send, so a reload cannot skip it', () => {
    remember(EMAIL, Date.now() - 10_000);
    renderWithProviders(<ConfirmEmailPage />);
    expect(screen.getByText(/resend in 0:2\d/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send a new code/i })).not.toBeInTheDocument();
  });
});

describe('what it says, and never says, about the account', () => {
  it('after a sign-up, no longer hedges about an existing account — only a new address gets here', () => {
    // It used to say "Already have an account? We sent you a sign-in link
    // instead": sign-up answered a taken address as if it were new. Since the
    // owner's ruling (28 Sep 2026) the sign-up form itself says an address is
    // taken, so this screen speaks only to someone creating an account.
    remember();
    renderWithProviders(<ConfirmEmailPage />);
    expect(screen.queryByText(/already have an account/i)).not.toBeInTheDocument();
    expect(screen.getByText(/finish creating your account/i)).toBeInTheDocument();
  });

  it('after a sign-in, does not — the password already proved the account', () => {
    remember();
    searchParams.value = new URLSearchParams('from=login');
    renderWithProviders(<ConfirmEmailPage />);
    expect(screen.queryByText(/already have an account with this email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/finish signing in/i)).toBeInTheDocument();
  });
});

describe('paste', () => {
  /*
   * AFTER `userEvent.setup()`, always: user-event installs its own clipboard on
   * `navigator` when it is set up, and a stub defined first is replaced by an
   * empty one — the test then reads "no code on your clipboard" and says
   * nothing about the screen.
   */
  function clipboard(readText: () => Promise<string>) {
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
  }

  it('reads the code out of whatever was copied, and submits it', async () => {
    remember();
    const user = userEvent.setup();
    clipboard(() => Promise.resolve('Your OxShare code is 482913.'));
    renderWithProviders(<ConfirmEmailPage />);
    await user.click(screen.getByRole('button', { name: /paste/i }));
    await waitFor(() =>
      expect(verifyEmailCode).toHaveBeenCalledWith({ email: EMAIL, code: '482913' }),
    );
  });

  it('says so when the clipboard holds no code, and submits nothing', async () => {
    remember();
    const user = userEvent.setup();
    clipboard(() => Promise.resolve('hello'));
    renderWithProviders(<ConfirmEmailPage />);
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no 6-digit code on your clipboard/i,
    );
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it('explains a refused clipboard rather than failing silently', async () => {
    remember();
    const user = userEvent.setup();
    clipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    renderWithProviders(<ConfirmEmailPage />);
    await user.click(screen.getByRole('button', { name: /paste/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not allow pasting/i);
  });
});

describe('Back', () => {
  it('returns to sign-up and forgets the address it was waiting on', async () => {
    remember();
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(push).toHaveBeenCalledWith('/auth/register');
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('returns to sign-in when that is where the client came from', async () => {
    remember();
    searchParams.value = new URLSearchParams('from=login');
    const user = userEvent.setup();
    renderWithProviders(<ConfirmEmailPage />);
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(push).toHaveBeenCalledWith('/auth/login');
  });
});
