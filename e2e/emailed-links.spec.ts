import { expect, test } from '@playwright/test';
import { newClient } from './helpers';

/**
 * The URLs that are already in people's inboxes.
 *
 * `/login`, `/register`, `/forgot-password` and `/reset-password` are five-line
 * `redirect()` files pointing at their `/auth/*` equivalents. They look like
 * dead weight, and `lib/api/auth.ts` records what happened the last time one
 * went missing: a verification link that had already been mailed out started
 * answering 404, for people who could do nothing about it.
 *
 * A mail already sent cannot be fixed by a deploy. That is the whole reason
 * these are asserted from the outside rather than trusted to a code review — a
 * deleted file is invisible in a diff nobody is looking at, and the failure lands
 * on the one person who cannot report it.
 *
 * These run signed OUT, because that is the state of the browser someone opens
 * an emailed link in: a new device, a private window, or a session that expired
 * while the mail sat unread.
 */

test.describe('links that were mailed before today', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const STUBS = [
    { from: '/login', to: /\/auth\/login/ },
    { from: '/register', to: /\/auth\/register/ },
    { from: '/forgot-password', to: /\/auth\/forgot-password/ },
    { from: '/reset-password', to: /\/auth\/reset-password/ },
  ];

  for (const { from, to } of STUBS) {
    test(`${from} still lands somewhere real`, async ({ page }) => {
      const res = await page.goto(from);

      // Not a 404, and not an error page wearing a 200.
      expect(res?.status(), `${from} answered ${res?.status()}`).toBeLessThan(400);
      await expect(page, `${from} did not reach its /auth equivalent`).toHaveURL(to);
    });
  }

  test('a reset link keeps its token through the redirect', async ({ page }) => {
    /*
     * The redirect is worth nothing if it drops the query string.
     *
     * The token IS the credential — `/reset-password` without it is a form that
     * cannot submit, and the client has no way to recover the value except to
     * request a second email and hope. A stub that forgets `?token=` fails in
     * exactly the way that looks like "the link expired".
     */
    await page.goto('/reset-password?token=e2e-not-a-real-token');

    await expect(page).toHaveURL(/\/auth\/reset-password/);
    expect(new URL(page.url()).searchParams.get('token')).toBe('e2e-not-a-real-token');
  });

  test('a verification link with a dead token says so, rather than breaking', async ({ page }) => {
    // Tokens expire in 24 hours and people open mail later than that. The
    // failure has to be a sentence, not a stack trace or a blank page.
    await page.goto('/verify-email?token=e2e-expired-token');

    await expect(page.getByRole('main')).toBeVisible();
    // Whatever it says, it must not be the raw success path.
    await expect(page.getByText(/invalid|expired|could not|failed|try again/i).first()).toBeVisible(
      {
        timeout: 15_000,
      },
    );
  });
});

test.describe('asking for a password reset', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('never tells an anonymous visitor whether an account exists', async ({ page }) => {
    /*
     * The screen must not become a membership oracle.
     *
     * `auth.service.ts` goes to real lengths over this — registration was
     * changed for the same reason — and a UI that says "no account found" gives
     * the whole thing back at the last step, after the API was careful.
     *
     * Asserted as a PROPERTY of each answer rather than by comparing a real
     * address against an invented one. That comparison is the stronger
     * statement and it is already made where it belongs, against the API, in
     * the backend suite. Here it would be flaky for a reason unrelated to what
     * it tests: password-reset requests are rate limited, so two submissions can
     * straddle the limit and differ because one was throttled. A test that goes
     * red for the wrong reason teaches people to ignore it.
     */
    for (const email of ['e2e@oxshare.com', newClient().email]) {
      await page.goto('/auth/forgot-password');
      await page.getByPlaceholder(/you@example\.com|email/i).fill(email);
      await page.getByRole('button', { name: /send|reset|continue/i }).click();
      await page.waitForLoadState('networkidle');

      const shown = (await page.getByRole('main').textContent()) ?? '';
      expect(shown, `the reset screen described the account status of ${email}`).not.toMatch(
        /no account|not found|does ?n[o']?t exist|unknown (email|address)|unregistered/i,
      );
    }
  });
});
