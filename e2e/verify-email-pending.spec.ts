import { expect, test } from './fixtures';
import { apiRoute } from './helpers';

/**
 * The screen a client sits on while waiting for a verification email.
 *
 * Both assertions here come from a person using the app, and both were measured
 * before they were fixed:
 *
 *  - It FLICKERED on every refresh. The page was styled with `<style jsx>`,
 *    which injects its CSS from JavaScript, so the first paint was the raw
 *    document — card full-width at the top-left, emoji at text size. A probe at
 *    `waitUntil: 'commit'` found `styleTags: 0` and the card at `x:0, y:0,
 *    width:1280`. This is the screen people reload most, because they are
 *    waiting for something to arrive.
 *
 *  - It was a DEAD END. `links: []` — no way off the page at all, for someone
 *    who mistyped their address or had already verified in another tab.
 *
 * Neither is visible to a component test: one is about what the browser paints
 * before hydration, the other about what the finished page offers.
 */

test.describe('the verify-email waiting screen', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe('before any JavaScript runs', () => {
    /*
     * JavaScript OFF, which is the precise question rather than a proxy for it.
     *
     * The flicker exists because styled-jsx injects its CSS from a script, so
     * the browser paints once with no styles and again once the script has run.
     * With scripting disabled, runtime CSS-in-JS can never apply and a linked
     * stylesheet always does — so this separates the two with no timing
     * involved at all.
     *
     * The first attempt sampled at `waitUntil: 'commit'`, which measured the
     * real thing but raced the stream: sometimes the document had not arrived
     * and the failure was "the card had not rendered", which says nothing about
     * styling. A test whose red means two different things is not worth having.
     */
    test.use({ javaScriptEnabled: false });

    test('is already laid out, so a refresh cannot flash unstyled content', async ({ page }) => {
      await page.goto('/verify-email/pending');

      const card = page.locator('main > div').first();
      await expect(card).toBeVisible();

      const box = await card.boundingBox();
      const viewport = page.viewportSize()!.width;

      expect(box, 'the card did not render without JavaScript').not.toBeNull();
      // Unstyled it spanned the full viewport from x=0; styled it is a bounded,
      // centred card with space either side.
      expect(box!.width, 'the card painted full-bleed').toBeLessThan(viewport);
      expect(box!.x, 'the card painted hard against the left edge').toBeGreaterThan(0);
      expect(
        Math.abs(box!.x + box!.width / 2 - viewport / 2),
        'the card was not centred',
      ).toBeLessThan(5);
    });
  });

  test('offers a way off the page', async ({ page }) => {
    // It offered none. Someone who mistyped their address, or verified in
    // another tab, had the back button and nothing else.
    await page.goto('/verify-email/pending');
    await page.waitForLoadState('networkidle');

    const signIn = page.getByRole('link', { name: /sign in/i });
    await expect(signIn, 'the waiting screen has no exit').toHaveCount(1);

    await signIn.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('still lets an anonymous visitor ask for another link', async ({ page }) => {
    /*
     * The resend box must keep working for someone with no session — an old
     * link, or a different device from the one they registered on. Prefilling
     * from the session must not become a requirement to HAVE one.
     */
    await page.goto('/verify-email/pending');
    await page.waitForLoadState('networkidle');

    const field = page.getByPlaceholder(/your email address/i);
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('');
    // Disabled until there is something to send to, rather than firing an empty
    // request and reporting a validation error from the API.
    await expect(page.getByRole('button', { name: /resend/i })).toBeDisabled();
  });
});

test.describe('following a verification link', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('verifies ONCE, even though the page mounts twice in development', async ({ page }) => {
    /*
     * The bug this catches was reported from the running app: "I got
     * verification failed, but then I logged in and I was verified."
     *
     * The token is single-use and the effect had no guard, so React's
     * StrictMode — which mounts every component twice on purpose — ran it
     * twice. The first call verified the account and spent the token; the second
     * found it spent, took a 400, and overwrote the success with "verification
     * failed". The client was verified and told they were not, which sends them
     * off to request a link they do not need.
     *
     * Asserted by COUNTING the requests rather than by reading the screen,
     * because the screen is downstream of the defect: the page could be made to
     * show success while still burning two tokens, and that would pass a
     * text-based check while leaving the real problem in place.
     */
    const attempts: string[] = [];
    page.on('request', (r) => {
      // The API path, not the page's: without the `/v1` prefix this also counts
      // the document navigation to /auth/verify-email itself.
      if (apiRoute('/auth/verify-email')(new URL(r.url()))) attempts.push(r.method());
    });

    await page.goto('/auth/verify-email?token=e2e-single-use-check');
    await page.waitForLoadState('networkidle');

    // EXACTLY one — `<= 1` is satisfied by zero, which is what a filter that
    // matches nothing produces, and that is how this test passed vacuously.
    expect(attempts.length, `the token was submitted ${attempts.length} times`).toBe(1);
  });
});
