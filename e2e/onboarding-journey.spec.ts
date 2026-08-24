import { expect, test } from './fixtures';
import { apiFromPage, APP_ORIGIN, linkIn, newClient, register, waitForMail } from './helpers';

/**
 * FR-IND-01 A→Z — a stranger becomes a client, through every door in order.
 *
 * register → the verification EMAIL arrives → the link verifies (exactly once,
 * and says so when revisited) → sign in works → the account is a "Normal"
 * (individual) client with a verified address → and the money doors are still
 * shut, because verification of the EMAIL is not verification of the PERSON:
 * /deposit and /withdraw hand the client to KYC.
 *
 * The email is read from Mailpit, as the person would read their inbox — the
 * token is stored hashed and echoed nowhere, so the mailbox is the only way
 * through, which is exactly why this journey could never be end-to-end before.
 *
 * ONE registration per run (the cap is ten per hour per IP), serial, each step
 * feeding the next.
 */
test.describe.configure({ mode: 'serial' });

const client = newClient();
let verifyLink = '';

test.use({ storageState: { cookies: [], origins: [] } });

test('a prospect registers and is parked on "check your email"', async ({ page }) => {
  await register(page, client);
  // The success message renders, and three seconds later the page moves to
  // sign-in — either state is a correct place to leave this step.
  await expect(page.getByText(/check your email|registration successful/i).first()).toBeVisible();
});

test('the verification email ARRIVES, and its link verifies the account', async ({ page }) => {
  const mail = await waitForMail(client.email, { subject: /verify/i });
  verifyLink = linkIn(mail, APP_ORIGIN);

  await page.goto(verifyLink);
  await expect(
    page.getByText(/verified|welcome/i).first(),
    'the emailed link did not verify the account',
  ).toBeVisible({ timeout: 15_000 });
  // The bearer token is scrubbed out of the address bar once spent.
  await expect(page).not.toHaveURL(/token=/);
});

test('the fresh client signs in, is a Normal (individual) client, and their email is verified', async ({
  page,
}) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(client.email);
  await page.locator('input[type="password"]').fill(client.password);
  const [login] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
  expect(login.ok(), `sign-in after verification answered ${login.status()}`).toBe(true);
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  const me = await apiFromPage(page, 'GET', '/auth/me');
  const profile = me.body as { email: string; emailVerified: boolean; type: string };
  expect(profile.email).toBe(client.email);
  expect(profile.emailVerified, 'the flag the verification exists to set').toBe(true);
  // FR-IND-01: created as the Normal (individual) type, attributed to nobody.
  expect(profile.type).toBe('individual');
});

test('a verified email does NOT open the money doors — KYC still gates them', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(client.email);
  await page.locator('input[type="password"]').fill(client.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  for (const door of ['/deposit', '/withdraw']) {
    await page.goto(door);
    await expect(page, `${door} opened for an unverified identity`).toHaveURL(/\/kyc/, {
      timeout: 20_000,
    });
  }
});

test('revisiting the spent link says "already verified", not "failed"', async ({ page }) => {
  /*
   * The person double-clicks, or the mail client prefetches: the second visit
   * must not tell a verified client that verification failed — the defect a
   * client actually reported once.
   */
  test.skip(!verifyLink, 'no link captured — the arrival test did not run');
  await page.goto(verifyLink);
  await expect(page.getByText(/already|verified/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/failed|invalid/i)).toHaveCount(0);
});
