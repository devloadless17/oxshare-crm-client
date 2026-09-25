import { expect, test } from './fixtures';

/**
 * ONE REGISTRATION PER REGISTRATION — proved in a browser.
 *
 * Reported from production: "after I press register, if I click it again it
 * works and sends many emails before it takes me to the login page."
 *
 * The unit test for this mocks the API and the router. This one clicks the real
 * button on the real page, which is how the bug was found and the only way to
 * see the window it lived in: the submit was disabled while the request was in
 * flight, then RE-ENABLED on success, and the page waited six seconds showing
 * the confirmation before navigating. For those six seconds the form was live
 * again with the same details in it.
 *
 * Measured with the fix removed: three clicks sent THREE registrations, so three
 * verification emails to the same address, each with a different valid link.
 */

/** Signed OUT — the register page is for people with no session. */
test.use({ storageState: { cookies: [], origins: [] } });

test('clicking Register three times sends exactly one registration', async ({ page }) => {
  let calls = 0;

  /*
   * The response is STUBBED, deliberately. The real route is capped at ten an
   * hour per IP, and the thing under test is what the BROWSER does when the
   * button is clicked again — not what the API answers. Stubbing also makes the
   * success path deterministic, which is the path the bug lived on.
   */
  await page.route('**/v1/auth/register', async (route) => {
    calls += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Check your inbox.' }),
    });
  });

  await page.goto('/auth/register');
  await page.waitForLoadState('networkidle');

  await page.getByLabel(/first name/i).fill('Ada');
  await page.getByLabel(/last name/i).fill('Lovelace');
  await page.getByLabel(/email/i).fill(`ada-${Date.now()}@example.test`);
  await page.getByLabel(/^password/i).fill('A-strong-passphrase-1');

  const submit = page.getByRole('button', { name: /^create account$/i });
  await submit.click();
  await expect.poll(() => calls, { timeout: 15_000 }).toBe(1);

  /*
   * The window the bug lived in: registered, the next screen not yet on. It
   * used to be six seconds of a live form; sign-up now goes straight to the
   * code screen, so the window is the navigation itself — and the button is
   * held busy through it.
   */
  await submit.click({ force: true, timeout: 3_000 }).catch(() => undefined);
  await submit.click({ force: true, timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);

  expect(calls, 'a second registration was sent — another email to the same person').toBe(1);
  await expect(page, 'a registration that succeeded went nowhere').toHaveURL(
    /\/auth\/confirm-email\?from=register$/,
  );
});
