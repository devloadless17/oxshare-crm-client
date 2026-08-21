import { expect, test } from './fixtures';
import { newClient } from './helpers';

/**
 * What a client meets when they open a link the product mailed them.
 *
 * These run signed OUT, because that is the state of the browser someone opens
 * an emailed link in: a new device, a private window, or a session that expired
 * while the mail sat unread.
 *
 * ## What used to be here, and why it is not
 *
 * This file also asserted that `/login`, `/register`, `/forgot-password` and
 * `/reset-password` still redirected to their `/auth/*` equivalents — five-line
 * stubs kept alive for links already in inboxes. Those four routes were then
 * deliberately deleted, and the tests went red pinning a requirement about
 * recipients who do not exist: nothing is deployed and no client has ever been
 * mailed a link by this system.
 *
 * So they were removed rather than parked. The day this ships to real people,
 * the requirement comes back with them — and it is a requirement about the
 * ROUTES, restored from git history, not about a test.
 *
 * `/verify-email` was never part of that removal and still resolves, so the
 * case below is live.
 */

test.describe('opening a verification link', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a dead token says so, rather than breaking', async ({ page }) => {
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
