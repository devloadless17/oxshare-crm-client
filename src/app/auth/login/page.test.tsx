import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import LoginPage from './page';

/**
 * The sign-in screen's three endings: in, refused, and "confirm your email
 * first" — the last of which now leads to the code screen, because the server
 * has just mailed the owner a fresh code (only once their password matched).
 */

const login = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const refetchUser = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock('@/lib/api', () => ({ api: { auth: { login } } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams.value,
}));
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ user: null, isLoading: false, hadSession: false, refetchUser }),
}));

const PENDING_KEY = 'oxshare.pending-email';

async function signIn(email = 'ada@example.test', password = 'A-strong-passphrase-1') {
  const user = userEvent.setup();
  renderWithProviders(<LoginPage />);
  await user.type(screen.getByLabelText(/^email$/i), email);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole('button', { name: /^log in$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  refetchUser.mockResolvedValue(undefined);
});

describe('an account whose email is not confirmed', () => {
  const unconfirmed = {
    response: {
      status: 403,
      data: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email to sign in.' },
    },
  };

  it('goes to the code screen with the address remembered — never in the URL', async () => {
    login.mockRejectedValueOnce(unconfirmed);
    await signIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/confirm-email?from=login'));
    expect(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '{}')).toMatchObject({
      email: 'ada@example.test',
    });
    // No red box on the way out: this is a next step, not a failure.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carries where the client was going, for after the code', async () => {
    searchParams.value = new URLSearchParams('next=%2Fwallet');
    login.mockRejectedValueOnce(unconfirmed);
    await signIn();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/auth/confirm-email?from=login&next=%2Fwallet'),
    );
  });
});

describe('a refused sign-in', () => {
  it('says why, stays put, and remembers nothing', async () => {
    login.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      },
    });
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

describe('a successful sign-in', () => {
  it('loads the session, then goes where the client was headed', async () => {
    searchParams.value = new URLSearchParams('next=%2Fwallet');
    login.mockResolvedValueOnce({ user: {}, emailVerified: true });
    await signIn();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/wallet'));
    expect(refetchUser).toHaveBeenCalledTimes(1);
  });
});
