import { expect, test } from './fixtures';

/**
 * A PARTNER'S REFERRAL CODE SURVIVES THE DETOUR THROUGH SIGN-IN.
 *
 * ## The defect this exists for
 *
 * `?ref=CODE` is captured in exactly ONE place — `register/page.tsx`, read from
 * the URL and never stored. Its own comment said *"nothing about it needs to
 * survive a reload"*. It needed to survive one LINK.
 *
 * Both cross-links were bare. So an ordinary client, making no mistake:
 *
 *   1. follows a partner's link and sees "Referred by PARTNER01"
 *   2. thinks they already have an account, clicks Sign in
 *   3. finds they do not, clicks Create an account
 *   4. lands on a BARE /auth/register — the banner is gone
 *   5. registers, attributed to NOBODY
 *
 * **And it is permanent.** `referredByIbUserId` is written once, at
 * registration, and no route, service method or admin screen anywhere can set
 * it afterwards. The partner loses that client for good and nothing records
 * that it happened. `resolveReferral` logs an unknown code rather than throwing
 * — correctly, since refusing a signup over a bad code is worse — which means a
 * lost code and a typo'd code have the identical outcome: silent success with
 * no attribution.
 *
 * ## Why the existing coverage could not see it
 *
 * `partner-journey.spec.ts` drives a ref link, and goes STRAIGHT from the link
 * to registration. The only path that breaks is the one that leaves and comes
 * back, and nothing walked it.
 *
 * ## This asserts the JOURNEY, not the href
 *
 * Reading the two `href` attributes would pass against links that carry the
 * code and a register page that had stopped reading it. Navigating the actual
 * round trip and asserting the code is still ACKNOWLEDGED ON SCREEN is what
 * proves attribution would still be sent.
 */

const CODE = 'PARTNER01';

/*
 * The login page's invitation to register reads "Sign up" — the client's own
 * wording, matched to the broker's existing site (it read "Create one" before).
 * `auth.login.register` in `lib/i18n/messages.ts`. Matched from the strings
 * file rather than from what the link ought to say: the first version of this
 * spec guessed, found nothing, and spent sixty seconds looking like a missing
 * link.
 */
const CREATE_LINK = /^sign up$/i;

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('a referral code and the sign-in detour', () => {
  test('survives register → sign in → register, and is still acknowledged', async ({ page }) => {
    await page.goto(`/auth/register?ref=${CODE}`);
    await expect(
      page.getByText(CODE),
      'the register page does not acknowledge the code it was given',
    ).toBeVisible();

    // The detour a client makes when they think they already have an account.
    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    // ...and back, through the login page's own invitation to register.
    await page.getByRole('link', { name: CREATE_LINK }).click();
    await expect(page).toHaveURL(/\/auth\/register/);

    await expect(
      page.getByText(CODE),
      'the code was lost on the detour — this client would register attributed ' +
        'to nobody, permanently, and nothing would record it',
    ).toBeVisible();
  });

  test('a visitor who never had a code is not given one', async ({ page }) => {
    /*
     * The positive control, and it is not a courtesy case: without it, a
     * register page that displayed a hardcoded banner would satisfy the case
     * above. It also pins that the login link stays clean for the ordinary
     * visitor, who is most of them.
     */
    await page.goto('/auth/login');
    await page.getByRole('link', { name: CREATE_LINK }).click();

    await expect(page).toHaveURL(/\/auth\/register$/);
    await expect(page.getByText(/referred by/i)).toBeHidden();
  });
});
