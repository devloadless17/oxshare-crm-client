import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { routeHit } from './helpers';

/**
 * The code screen and the "verify now or later" screen, on the phone most
 * clients sign up from — without spending a registration.
 *
 * `email-code-signup.spec.ts` drives the real journey against the real API and
 * mailbox, and costs registrations, so it runs on desktop only. What only a
 * PHONE can show — six boxes on one row inside a narrow screen, both answers of
 * the onboarding screen within reach — is proved here, with the API answered by
 * the test. Every stub is counted (`routeHit`), so a handler that never fired
 * cannot let an assertion pass against the real API instead.
 *
 * Replaces `verify-email-pending.spec.ts`: the "we sent you a link" screen it
 * covered is now a redirect to the code screen.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL = 'layout-check@example.test';

/** Arrive exactly as sign-up leaves a client: the address in this tab's storage. */
async function arriveFromSignUp(page: Page): Promise<void> {
  await page.addInitScript((email) => {
    sessionStorage.setItem('oxshare.pending-email', JSON.stringify({ email, sentAt: Date.now() }));
  }, EMAIL);
  await page.goto('/auth/confirm-email?from=register');
  await expect(page.getByLabel(/verification code/i)).toBeVisible({ timeout: 20_000 });
}

/** Nothing on the page may be wider than the screen it is on. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector('main') ?? document.documentElement;
    return scroller.scrollWidth - scroller.clientWidth;
  });
  expect(overflow, 'the screen scrolls sideways').toBeLessThanOrEqual(0);
}

test.describe('the code screen', () => {
  test('the old "check your inbox" address leads to it', async ({ page }) => {
    await page.goto('/verify-email/pending');
    await expect(page).toHaveURL(/\/auth\/confirm-email$/);
  });

  test('six boxes on ONE row, inside the screen, with the address shown', async ({ page }) => {
    await arriveFromSignUp(page);
    await expect(page.getByText(EMAIL, { exact: true })).toBeVisible();

    const box = await page.getByLabel(/verification code/i).boundingBox();
    const width = page.viewportSize()!.width;
    expect(box, 'the code field did not render').not.toBeNull();
    expect(box!.x, 'the boxes start off the left of the screen').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, 'the boxes run off the right').toBeLessThanOrEqual(width);
    // One row of 56px boxes. Wrapped onto two, the field would be twice that.
    expect(box!.height, 'the six boxes wrapped onto a second row').toBeLessThan(80);
    await expectNoSidewaysScroll(page);
  });

  test('the sixth digit sends the code ONCE; a refusal clears the boxes and says why', async ({
    page,
  }) => {
    const verify = await routeHit(page, '/auth/verify-email-code', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          code: 'EMAIL_CODE_INVALID',
          message: 'That code is incorrect or has expired.',
        }),
      }),
    );
    await arriveFromSignUp(page);

    await page.getByLabel(/verification code/i).pressSequentially('123456', { delay: 30 });
    await expect.poll(() => verify.hits()).toBe(1);
    // Filtered: Next's own route announcer is a `role="alert"` too.
    await expect(
      page.getByRole('alert').filter({ hasText: /incorrect or has expired/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/verification code/i)).toHaveValue('');
    // The boxes take the next attempt without a tap.
    await expect(page.getByLabel(/verification code/i)).toBeFocused();
    expect(verify.hits(), 'a second request for the same six digits').toBe(1);
  });

  test('asks an anonymous visitor for their address — and sends no code for it', async ({
    page,
  }) => {
    const resend = await routeHit(page, '/auth/resend-verification', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' }),
    );
    await page.goto('/auth/confirm-email');
    await page.getByLabel(/^email$/i).fill(EMAIL);
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByLabel(/verification code/i)).toBeVisible();
    await expect(page.getByText(EMAIL, { exact: true })).toBeVisible();
    // They may hold a good code already; a new one would kill it.
    expect(resend.hits()).toBe(0);
  });

  test('offers a way off the page', async ({ page }) => {
    await page.goto('/auth/confirm-email');
    await page.getByRole('button', { name: /^back$/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('the "verify now or later" screen', () => {
  test('both answers are on screen and tappable, and nothing scrolls sideways', async ({
    page,
  }) => {
    /*
     * The session answered by the test: a confirmed client who has not started
     * KYC and is no partner. `/onboarding` renders no portal chrome, so these
     * three reads — `RequireAuth` asks for the partner status on every private
     * route — are the whole of what it asks for. Leaving one to the real API is
     * a 401 there, which the app answers correctly by signing the visitor out.
     */
    const me = await routeHit(page, '/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1000001,
          email: EMAIL,
          firstName: 'Ada',
          lastName: 'Lovelace',
          emailVerified: true,
          verificationLevel: 0,
          type: 'individual',
          status: 'active',
        }),
      }),
    );
    const kyc = await routeHit(page, '/kyc/status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
    );
    // Not built for this client: a 404 is "no partner record", never "hidden".
    await routeHit(page, '/ib/status', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404}' }),
    );

    await page.goto('/onboarding');
    await expect(
      page.getByRole('heading', { name: /complete your identity verification/i }),
    ).toBeVisible({ timeout: 20_000 });
    expect(me.hits()).toBeGreaterThan(0);
    expect(kyc.hits()).toBeGreaterThan(0);

    await expect(page.getByRole('img', { name: /step 1 of 2 complete/i })).toBeVisible();
    await expect(page.getByText(/welcome, ada/i)).toBeVisible();
    /*
     * ABOVE THE FOLD, with no scrolling — on the 1280×720 laptop (chromium) and
     * the Pixel 7 (mobile). Checked BEFORE anything scrolls: scrolling a control
     * into view and then finding it in view proves nothing about where it was.
     */
    const now = page.getByRole('link', { name: /verify now/i });
    const later = page.getByRole('link', { name: /verify later/i });
    await expect(now, '"Verify now" is below the fold').toBeInViewport({ ratio: 1 });
    await expect(later, '"Verify later" is below the fold').toBeInViewport({ ratio: 1 });
    // A thumb-sized target: WCAG 2.5.5 asks for 44px.
    expect((await now.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoSidewaysScroll(page);
  });
});
