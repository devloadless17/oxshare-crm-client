import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import VerifyEmailPage from './page';

/**
 * The verification screen — UX-BACKLOG UX-01.
 *
 * ## What this is guarding
 *
 * The defect was never a crash. Verification WORKED; the screen then told the
 * client it had failed, because "already redeemed" and "never valid" arrived as
 * the same 400 and were rendered as the same red box. Telling a customer that
 * something failed when it succeeded is expensive in a money product in a way it
 * is not elsewhere, and this is the first screen a new client ever sees.
 *
 * So these tests are about WHICH SENTENCE appears, which is the whole bug. The
 * lifecycle underneath is covered against real Postgres in the backend's
 * `email-verification-cycle.spec.ts`; what cannot be asserted there is that a
 * verified account never sees the word "Failed".
 */

const verifyEmail = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

/*
 * `replace` ACTUALLY CLEARS THE QUERY, because the real one does.
 *
 * A `vi.fn()` no-op hid a real bug for exactly as long as it existed. This
 * screen strips its own token from the URL, which re-runs the effect that reads
 * it — so the mock has to model that, or every test runs against a page whose
 * URL never changes and the most interesting interaction on the screen is the
 * one nothing exercises.
 *
 * What it hid: stripping the token after a FAILURE re-entered the effect with an
 * empty token, which is indistinguishable from arriving with no link at all, and
 * overwrote "this link has expired" with "the token is missing". Every unit test
 * passed. A browser found it in one click.
 */
const replace = vi.hoisted(() =>
  vi.fn((url: string) => {
    searchParams.value = new URLSearchParams(url.split('?')[1] ?? '');
  }),
);

vi.mock('@/lib/api', () => ({
  api: { auth: { verifyEmail, resendVerification: vi.fn() } },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => searchParams.value,
}));

/** An axios-shaped rejection, as `apiErrorCode`/`apiErrorMessage` read it. */
function apiError(code: string, message: string) {
  return { response: { data: { code, message } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  searchParams.value = new URLSearchParams('token=a-real-token');
});

describe('a link that has already been used', () => {
  beforeEach(() => {
    verifyEmail.mockResolvedValue({ status: 'already_verified', message: 'anything at all' });
  });

  it('NEVER says verification failed', async () => {
    /*
     * The regression test for UX-01 itself. A refresh, the Back button, a
     * restored tab, or a corporate mail scanner that opened the link first all
     * land here — on an account that IS verified.
     */
    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/already been used/i);
    expect(screen.queryByText(/verification failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid or has expired/i)).not.toBeInTheDocument();
  });

  it('offers the way onward, because there is nothing to fix', async () => {
    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/already been used/i);
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    // No resend field: the address is confirmed, and asking for an email
    // address here would imply otherwise.
    expect(screen.queryByPlaceholderText(/your email address/i)).not.toBeInTheDocument();
  });

  it('decides from `status`, not from the message text', async () => {
    /*
     * The message is prose and is translated (FSD §10 / D-16). The portal used
     * to branch on English, which is the class of defect `apiErrorCode` exists
     * to end — so the stub returns a message that says nothing useful and the
     * screen still has to get it right.
     */
    verifyEmail.mockResolvedValue({ status: 'already_verified', message: 'حساب مُوثَّق' });

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/already been used/i);
  });
});

describe('a link redeemed just now', () => {
  it('celebrates, and strips the spent token from the URL', async () => {
    /*
     * `replace`, not `push`: a refresh must not re-POST a credential that has
     * already done its job, and Back should leave this screen rather than
     * re-enter it. The token also stops sitting in the address bar, where it
     * reaches history and the next page's Referer.
     */
    verifyEmail.mockResolvedValue({ status: 'verified', message: 'ok' });

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/verified successfully/i);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth/verify-email'));
  });

  it('survives the refresh that follows', async () => {
    /*
     * Stripping the token means a reload arrives with nothing to verify. Without
     * a memory of what happened, that renders "token is missing" — trading one
     * wrong red screen for another.
     */
    verifyEmail.mockResolvedValue({ status: 'verified', message: 'ok' });
    const first = renderWithProviders(<VerifyEmailPage />);
    await screen.findByText(/verified successfully/i);
    first.unmount();

    // The reload: same tab, no token in the URL.
    searchParams.value = new URLSearchParams();
    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/verified successfully/i);
    expect(screen.queryByText(/token is missing/i)).not.toBeInTheDocument();
    // And it did NOT go back to the API — that is the point of remembering.
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });
});

describe('a link that has expired', () => {
  it('says so, and asks for a new one', async () => {
    /*
     * Expired and never-valid used to be one message. A client whose link had
     * merely aged out was told nothing they could act on.
     */
    verifyEmail.mockRejectedValue(
      apiError('VERIFICATION_TOKEN_EXPIRED', 'Verification token has expired.'),
    );

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/this link has expired/i);
    expect(screen.getByText(/valid for 24 hours/i)).toBeInTheDocument();
    // The way out is on screen.
    expect(screen.getByPlaceholderText(/your email address/i)).toBeInTheDocument();
  });
});

describe('a settled conclusion is never downgraded by a URL change', () => {
  it('keeps saying EXPIRED — the screen must not overwrite itself', async () => {
    /*
     * The regression test for a bug a browser found and the unit tests did not.
     *
     * This screen strips its own token from the URL, which re-runs the effect
     * that reads it. An empty token is indistinguishable from arriving with no
     * link at all, so the precise "this link has expired" was replaced a
     * heartbeat later by the generic "the token is missing" — one wrong red
     * screen traded for another.
     *
     * Two things stop it now, and this asserts the outcome of both: the strip
     * only happens on success, and the no-token branch refuses to overwrite a
     * conclusion that has already been reached.
     */
    verifyEmail.mockRejectedValue(
      apiError('VERIFICATION_TOKEN_EXPIRED', 'Verification token has expired.'),
    );

    renderWithProviders(<VerifyEmailPage />);
    await screen.findByText(/this link has expired/i);

    // Long enough for a stray re-render to have overwritten it.
    await new Promise((r) => setTimeout(r, 150));

    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/token is missing/i)).not.toBeInTheDocument();
    // A failed token was never spent, so there is nothing to strip.
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('a token that was never valid', () => {
  it('still reports a genuine failure as a failure', async () => {
    /*
     * The fix must not turn every refusal into reassurance. A forged or
     * superseded token really has failed, and this screen must keep saying so.
     */
    verifyEmail.mockRejectedValue(
      apiError('VALIDATION_FAILED', 'Invalid or expired verification token.'),
    );

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/verification failed/i);
    expect(screen.getByText(/invalid or expired verification token/i)).toBeInTheDocument();
  });

  it('does not remember a failure as a success', async () => {
    verifyEmail.mockRejectedValue(apiError('VALIDATION_FAILED', 'Invalid.'));
    const first = renderWithProviders(<VerifyEmailPage />);
    await screen.findByText(/verification failed/i);
    first.unmount();

    searchParams.value = new URLSearchParams();
    renderWithProviders(<VerifyEmailPage />);

    // A refresh after a real failure asks again rather than inventing a
    // verification that never happened.
    await screen.findByText(/token is missing/i);
  });
});

describe('arriving with no token at all', () => {
  it('says the link is incomplete', async () => {
    searchParams.value = new URLSearchParams();

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/token is missing/i);
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});

describe('when the rate limiter steps in', () => {
  it('does not blame the link', async () => {
    /*
     * The route allows 10 attempts per 15 minutes (auth.controller.ts), which a
     * scanner, a refresh and a human pulling on the same link can reach. A 429
     * used to fall through to the generic red box and read "Verification
     * Failed" — telling a client their link was broken when the only thing that
     * happened is that we asked them to wait.
     *
     * The backend had to change for this to be knowable: `ThrottlerException`
     * carries a string body, and the filter's string branch returned a literal
     * `HTTP_ERROR` instead of deriving `RATE_LIMITED` from the status. Every 429
     * in the system reached the frontends codeless.
     */
    verifyEmail.mockRejectedValue(
      apiError('RATE_LIMITED', 'ThrottlerException: Too Many Requests'),
    );

    renderWithProviders(<VerifyEmailPage />);

    await screen.findByText(/too many attempts/i);
    expect(screen.queryByText(/verification failed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nothing has gone wrong with it/i)).toBeInTheDocument();
  });
});
