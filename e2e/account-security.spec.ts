import { expect, test } from './fixtures';
import { API_BASE, E2E_CLIENT, signIn } from './helpers';

/**
 * The two controls on /profile that a client reaches for when something has
 * gone wrong: "where am I signed in" and "change my password".
 *
 * These are worth a browser precisely because their value is a claim about
 * OTHER browsers. A unit test can prove the button calls the endpoint; only a
 * second real session can prove the endpoint ended it. That distinction is not
 * academic — revocation reached the refresh family alone for a while, so the
 * revoked session's access token kept working for up to fifteen minutes and the
 * UI happily reported success. Every unit test still passed.
 *
 * Nothing here changes the fixture's password. `E2E_CLIENT` is shared by the
 * whole suite through `storageState`, and a spec that rotated its credentials
 * would break every spec that runs after it — including on a re-run, where the
 * old password no longer works. The rejection path is asserted instead, and the
 * success path is covered against the API in the backend suite.
 */

test.describe('the sessions list', () => {
  test('marks exactly one session as this device, and will not offer to kill it', async ({
    page,
  }) => {
    /*
     * The current session is identified from the REFRESH cookie, because the
     * access token names its family but the page cannot read either. Getting
     * this wrong in the safe direction shows every session as "this device";
     * getting it wrong in the other offers a revoke button that the API always
     * refuses — a control that cannot work is worse than no control.
     */
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const current = page.getByText(/this device/i);
    await expect(current).toHaveCount(1);

    // The row carrying that badge must not also carry a revoke control.
    const currentRow = page.locator('li', { has: current }).first();
    await expect(currentRow.getByRole('button')).toHaveCount(0);
  });

  test('signing out another device ends it immediately, not in fifteen minutes', async ({
    page,
    browser,
  }) => {
    /*
     * THE assertion this file exists for, and the one that needed two browsers.
     *
     * A second context is a genuinely separate browser: its own cookie jar, its
     * own session, its own refresh family. Revoking it from the first has to
     * take effect on the SECOND's very next request — not at its next rotation,
     * which is up to fifteen minutes away. Those fifteen minutes begin the
     * moment a client spots a session they do not recognise, which is the only
     * moment this feature is ever used.
     */
    // Three navigations, a sign-in and two polls in one test — comfortably past
    // the 60s default, and a timeout here would read as a product failure.
    test.setTimeout(150_000);

    /*
     * Explicitly signed OUT.
     *
     * `browser.newContext()` inherits the project's `storageState`, so without
     * this the "second browser" was the SAME session: it opened /auth/login,
     * was bounced straight to /dashboard by the already-authenticated guard, and
     * the form it was about to fill in never rendered. The spec then waited for
     * a login request that could never happen.
     *
     * A second SESSION is the entire premise here, not a second tab.
     */
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const otherPage = await other.newPage();

    try {
      await signIn(otherPage, E2E_CLIENT);
      await expect(otherPage).toHaveURL(/\/dashboard/);

      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
      /*
       * The precondition, stated.
       *
       * Without it, a FIRST session that is not signed in presents as "zero
       * other sessions in the list" — which accuses the sessions feature of a
       * fault belonging to the fixture, and costs several probes to unpick.
       */
      await expect(page, 'the first session was not signed in').toHaveURL(/\/profile/);

      /*
       * Anchored `^sign out$`. A looser pattern matched "Send" on the same page
       * and clicked something else entirely, which surfaced as a timeout rather
       * than as a wrong click — the worst kind of failure, because it accuses
       * the product of the harness's mistake.
       */
      /*
       * Sign out EVERY other device, one at a time.
       *
       * Two things forced this shape. Picking `.first()` and hoping it is the
       * session just created only works on a pristine account, and any earlier
       * run that failed part-way leaves a live session behind — so the spec
       * became dependent on the outcome of its own previous invocations.
       * Revoking all of them is both the honest journey ("sign out everywhere
       * else") and self-cleaning, so a run always starts from the same place.
       *
       * Each iteration WAITS for the count to fall before clicking again. The
       * button re-renders as "Signing out…" and the row is then removed, so a
       * loop that re-clicks immediately is clicking a detached element and hangs
       * — which reads as the product being slow rather than the spec being
       * wrong.
       */
      const revokeButtons = page.getByRole('button', { name: /^sign out$/i });
      let remaining = await revokeButtons.count();
      expect(remaining, 'the second session never appeared in the list').toBeGreaterThan(0);

      /*
       * The count alone cannot say WHY it did not fall, and it blamed the wrong
       * thing when it did not.
       *
       * A refused sign-out and a list that failed to refresh look identical to a
       * count assertion: `SessionRow` renders the failure INLINE — it sets the
       * error, deliberately does not clear it, and sets `busy` false — so the
       * button comes back as "Sign out" and the count stays exactly where it
       * was. That is what a crosshost run produced: ten buttons, click one,
       * still ten across all 24 polls, reported as "the list did not update"
       * while a `role="alert"` sat in the row saying the sign-out was refused.
       *
       * So assert BOTH, together, and let the alert be the one that speaks: if a
       * revoke is refused this now fails naming the refusal instead of accusing
       * the list of being stale. Same class as the 403-for-the-wrong-reason trap
       * in the §14 walk — a true assertion that describes two different worlds
       * and names the wrong one.
       */
      /*
       * The alert is found BY ROLE, never by its text — and this exact assertion
       * was written by text first, which did not work.
       *
       * `handleRevoke` renders `apiErrorMessage(err, t('profile.sessionRevokeFailed'))`,
       * and the fallback is only reached when the error carries no message of its
       * own. Forcing every DELETE to 500 proved it: the row rendered "Request
       * failed with status code 500", the regex for the fallback copy matched
       * NOTHING, and the spec fell straight back to blaming the count — the very
       * failure this block exists to prevent, reproduced by the fix for it.
       *
       * That is class 10 in one sentence: a bug class tried in ONE SPELLING is
       * not tested. The role is the property; the sentence is one of its values.
       *
       * Scoped to the ROWS. The profile page carries an unrelated page-level
       * alert (a toast container), and matching that would make this fail for a
       * reason that has nothing to do with signing a session out — swapping one
       * wrong-reason failure for another.
       */
      const revokeFailed = page.getByRole('listitem').getByRole('alert');

      while (remaining > 0) {
        await revokeButtons.first().click();
        remaining -= 1;
        await expect(async () => {
          await expect(revokeFailed, 'a sign-out was REFUSED by the API').toHaveCount(0);
          await expect(revokeButtons).toHaveCount(remaining);
        }).toPass({ timeout: 15_000 });
      }
      await expect(page.getByText(/this device/i)).toHaveCount(1);

      /*
       * Now the part that is not a UI claim: the other browser is dead.
       *
       * Asserted by NAVIGATING rather than by reading the list, because the list
       * is the first browser's opinion. Only the second browser being turned
       * away proves the server stopped honouring its cookie.
       */
      await otherPage.goto('/wallet');
      await expect(otherPage, 'the revoked session was still able to browse').toHaveURL(
        /\/auth\/login/,
        { timeout: 20_000 },
      );
    } finally {
      await other.close();
    }
  });
});

test.describe('changing a password', () => {
  test('refuses the wrong current password without ending the session', async ({ page }) => {
    /*
     * The failure has to be a message, not a logout.
     *
     * A rejected change means the client is still who they were, and signing
     * them out on a mistyped password would punish exactly the person the
     * feature is for. It also has to say something: a silent no-op reads as a
     * broken button and produces a support ticket.
     */
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    await page.locator('#current-password').fill('definitely-not-the-password');
    await page.locator('#new-password').fill('a-new-password-123');
    await page.locator('#confirm-password').fill('a-new-password-123');
    await page
      .getByRole('button', { name: /update|change|save/i })
      .first()
      .click();

    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
    // Still signed in, still here.
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('button', { name: /^log in$/i })).toHaveCount(0);
  });

  test('will not accept two new passwords that disagree', async ({ page }) => {
    // Caught in the browser, so it costs no round trip and no rate-limit budget
    // — `change-password` is throttled to five per fifteen minutes because it
    // verifies the current password and so is an oracle for guessing it.
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    await page.locator('#current-password').fill('client123');
    await page.locator('#new-password').fill('a-new-password-123');
    await page.locator('#confirm-password').fill('a-different-password-123');
    await page
      .getByRole('button', { name: /update|change|save/i })
      .first()
      .click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    // The password is unchanged, which the next spec depends on.
    await expect(page).toHaveURL(/\/profile/);
  });
});

test.describe('the client knows their Portal ID', () => {
  test('the profile shows the number the broker knows them by', async ({ page }) => {
    /*
     * The Portal ID (0133) is how every screen of the broker's console names a
     * client and what every search there takes — so it is the number a client
     * quotes to support, and the profile says so. Since backend 0159 it is
     * also the account's only identifier — `id` and `portalId` are one number.
     */
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const me = await page.evaluate(async (api) => {
      const res = await fetch(`${api}/auth/me`, { credentials: 'include' });
      return (await res.json()) as { id: number; portalId: number };
    }, API_BASE);

    expect(me.portalId, 'the profile API sent no Portal ID').toBeGreaterThan(0);
    const field = page.locator('div', { has: page.getByText('Portal ID', { exact: true }) }).last();
    await expect(field).toContainText(String(me.portalId));
    await expect(page.getByText(/quote it when you contact us/i)).toBeVisible();
    expect(me.id, 'the account has a second identifier beside its Portal ID').toBe(me.portalId);
  });
});
