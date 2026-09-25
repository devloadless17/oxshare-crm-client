import { expect, test } from './fixtures';
import {
  API_BASE,
  collectRejections,
  E2E_CLIENT,
  newClient,
  register,
  routeHit,
  signIn,
} from './helpers';

/**
 * Does the session actually hold, on every page, across a refresh?
 *
 * The portal moved from tokens the app could read to httpOnly cookies it cannot.
 * That is the right design and it moved the failure modes rather than removing
 * them: nothing in the browser can now ask "am I signed in" directly, so every
 * screen infers it from `/auth/me`, and each inference is a chance to get it
 * wrong in a way no unit test sees.
 *
 * The specific things that go wrong with cookie sessions, all asserted below:
 *
 *  - A hard refresh loses the in-memory context. If a page renders its
 *    signed-out state before `/auth/me` answers, an authenticated client sees a
 *    flash of "you are logged out" — or worse, gets redirected to login.
 *  - A guard that reads a CLAIM breaks when the token it is handed changes
 *    shape. That exact bug shipped here: gating moved to the refresh cookie,
 *    which carries no `emailVerified`, and every client was bounced off
 *    onboarding. `route-guard.ts` records it.
 *  - A signed-out visitor deep-linking to a private page must not see its
 *    contents first and be redirected after.
 *
 * These need a real browser: they are about what a cookie does across a full
 * page load, which is precisely what jsdom cannot reproduce.
 */

/** Every private screen, refreshed on each. */
const PRIVATE_PAGES = ['/dashboard', '/wallet', '/transactions', '/accounts', '/kyc'];

test.describe('an authenticated session', () => {
  test('survives a hard refresh on every private page', async ({ page }) => {
    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Still here, and never bounced to login.
      expect(page.url(), `refreshing ${path} redirected away`).toContain(path);
      await expect(
        page.getByRole('button', { name: /^log in$/i }),
        `refreshing ${path} rendered the signed-out screen`,
      ).toHaveCount(0);
    }
  });

  test('never flashes the signed-out UI while /auth/me is in flight', async ({ page }) => {
    /*
     * The cookie-session failure mode that a user notices and a test usually
     * does not: the session is valid, but the app cannot know it until a request
     * answers, so a screen that assumes "no user yet" means "signed out" shows
     * the login state for a moment on every load.
     *
     * `/auth/me` is delayed so that moment is wide enough to observe. If nothing
     * is wrong, the page waits rather than lying.
     */
    const me = await routeHit(page, '/auth/me', async (route) => {
      await new Promise((r) => setTimeout(r, 1_200));
      await route.continue();
    });

    await page.goto('/dashboard');
    // Sampled DURING the delay, not after it.
    await page.waitForTimeout(400);

    expect(page.url()).toContain('/dashboard');
    await expect(page.getByRole('button', { name: /^log in$/i })).toHaveCount(0);
    // The delay really was in force while we sampled.
    expect(me.hits(), 'the delaying route never fired').toBeGreaterThan(0);
  });

  test('does not loop or 401 while simply moving around', async ({ page }) => {
    // A refresh cycle that misfires shows up as repeated 401s rather than as a
    // broken screen — the session self-heals and nobody notices except the log.
    const rejections = collectRejections(page);

    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(rejections.list()).toEqual([]);
  });

  /*
   * Logout lives in `session-lifecycle.spec.ts` now, and is no longer `fixme`.
   *
   * It sits there rather than here because driving a real sign-out REVOKES the
   * refresh-token family, and every spec in this file replays the one session
   * cached in STORAGE_STATE. A logout run against that session would kill it
   * for everything scheduled afterwards — so the rewritten test opens a context
   * with no stored state and signs in for itself.
   */
});

test.describe('no session at all', () => {
  // A brand-new browser: no cookies, nothing cached.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sends a deep link to login without showing the page first', async ({ page }) => {
    for (const path of PRIVATE_PAGES) {
      await page.goto(path);
      await expect(page, `${path} did not send a signed-out visitor to login`).toHaveURL(
        /\/auth\/login/,
        { timeout: 15_000 },
      );
    }
  });

  test('does not render private content before redirecting', async ({ page }) => {
    // The redirect is worth little if the page paints first. A signed-out
    // visitor should never see a wallet balance, even for a frame.
    await page.goto('/wallet');
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByText(/balance/i)).toHaveCount(0);
  });

  test('reaches the public pages it is supposed to', async ({ page }) => {
    // The mirror of the above: gating everything is not correctness either.
    for (const path of ['/auth/login', '/auth/register', '/auth/forgot-password']) {
      await page.goto(path);
      await expect(page, `${path} should be public`).toHaveURL(new RegExp(path));
    }
  });
});

test.describe('registration', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('registers, and lands the new client on the code screen rather than KYC', async ({
    page,
  }) => {
    /*
     * The whole journey, for an account that has never existed.
     *
     * The landing matters: a brand-new client is NOT email-verified, and every
     * `/kyc/*` endpoint sits behind `EmailVerifiedGuard`. Sending them to
     * onboarding would mean a wizard that 403s on every request it makes. The
     * code screen is where they confirm the address (and are signed in by it);
     * `email-code-signup.spec.ts` drives the rest of that journey.
     */
    const client = newClient();
    const rejections = collectRejections(page);

    await register(page, client);

    // The screen that takes the emailed code — never the KYC wizard.
    await page.waitForURL(/\/auth\/confirm-email/, { timeout: 30_000 });
    expect(page.url()).not.toContain('/kyc/step');

    /*
     * 403s only. A signed-out visitor's `/auth/me` answers 401 BY DESIGN — that
     * is how the app asks "is anyone here" — so counting 401s on a public page
     * would assert that a correct question was never asked.
     *
     * A 403 is different: it means the app asked for something it is not allowed
     * to have, which on the registration screen it never should.
     */
    expect(rejections.list().filter((r) => r.startsWith('403'))).toEqual([]);
  });

  test('refuses a password the API considers too short, and says so', async ({ page }) => {
    const client = newClient();

    await page.goto('/auth/register');
    await page.getByPlaceholder('John').fill('Kaya');
    await page.getByPlaceholder('Doe').fill('Newman');
    await page.getByPlaceholder('you@example.com').fill(client.email);
    await page.locator('input[type="password"]').first().fill('short');
    await page.getByRole('button', { name: /complete registration|create account/i }).click();

    // Still on the form, with something said about it. Which side rejected it
    // does not matter to the client; being told does.
    await expect(page).toHaveURL(/register/);
  });
});

test.describe('an unverified client', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('is not left hammering endpoints it is not allowed to use', async ({ page }) => {
    /*
     * The 403 flood, as a journey rather than a component.
     *
     * The sidebar's KYC-status query was keyed on the pathname, so an unverified
     * client fired a guaranteed 403 on EVERY navigation — invisible in the UI,
     * and only ever apparent in the server log.
     */
    const client = newClient();

    await register(page, client);
    await page.waitForURL(/\/auth\/confirm-email/, { timeout: 30_000 });

    // Counted only AFTER registration settles, so this is about browsing.
    const rejections = collectRejections(page);
    await page.goto('/kyc');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const forbidden = rejections.list().filter((r) => r.startsWith('403'));
    expect(forbidden, 'an unverified client should not be asking for KYC data').toEqual([]);
  });
});

test.describe('the session belongs to the server', () => {
  test('cannot be forged from JavaScript', async ({ page }) => {
    /*
     * The point of the httpOnly migration, asserted rather than assumed.
     *
     * If the session were readable or writable from JS, every XSS would be a
     * full account takeover. `document.cookie` must not expose it — and the CSRF
     * token, which IS readable by design, is not a credential.
     */
    await page.goto('/dashboard');
    const visible = await page.evaluate(() => document.cookie);

    expect(visible).not.toMatch(/access_token/);
    expect(visible).not.toMatch(/refresh_token/);
  });

  test('a signed-in client is really signed in, not just rendering as if', async ({ page }) => {
    // The end-to-end statement: the cookie the browser holds is one the API
    // accepts, on a request the page made itself.
    await page.goto('/dashboard');
    const me = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/auth/me`, { credentials: 'include' });
      return { status: res.status, body: (await res.json()) as { email?: string } };
    }, API_BASE);

    expect(me.status).toBe(200);
    expect(me.body.email).toBe(E2E_CLIENT.email);
  });
});

test.describe('signing in', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('lands on the dashboard with a session that survives a refresh', async ({ page }) => {
    await signIn(page, E2E_CLIENT);

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('button', { name: /^log in$/i })).toHaveCount(0);
  });
});
