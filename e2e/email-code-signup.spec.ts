import { request, type BrowserContext, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API_NODE_BASE,
  APP_ORIGIN,
  E2E_CLIENT,
  apiFromPage,
  deleteCookie,
  isApi,
  linkIn,
  newClient,
  register,
  signIn,
  waitForCodeMail,
} from './helpers';

/**
 * SIGN-UP ENDS ON A CODE — the client's request (25 Sep 2026), driven end to
 * end against the real API, with the real emails read out of Mailpit.
 *
 *   register → the code screen → the email (code in the subject, link as a
 *   fallback) → a wrong code → a resend after the cooldown, killing the old
 *   code → the right code SIGNS THE CLIENT IN → "verify now or later" → both
 *   answers → the session renews like any other → nothing can be replayed:
 *   not the code, not the link, not a rotated refresh token → and the password
 *   still signs them in afterwards.
 *
 * ONE journey, in ONE tab, because the tab is part of what is under test: the
 * address travels from sign-up to the code screen in its sessionStorage, and
 * the session the code starts lives in its cookie jar.
 *
 * Registration is capped at ten an hour per IP, so the whole file costs three:
 * this journey, the unconfirmed sign-in below, and the address that already
 * has an account. Chromium only (see playwright.config.ts) — the phone layout
 * is proved by `confirm-email-screen.spec.ts`, which spends none.
 */

test.describe.configure({ mode: 'serial' });

const client = newClient();
let context: BrowserContext;
let page: Page;

let firstCode = '';
let firstMailId = '';
let liveCode = '';
let liveLink = '';
/** The refresh token the code sign-in issued, captured before it is rotated. */
let spentRefresh: { name: string; value: string } | undefined;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

const codeBox = () => page.getByLabel(/verification code/i);
const refreshCookie = async () => (await context.cookies()).find((c) => /_rt$/.test(c.name));

/** Type a code the way a person does, and hand back what the API answered. */
async function typeCode(target: Page, code: string) {
  const [answer] = await Promise.all([
    target.waitForResponse((r) => isApi(r, '/auth/verify-email-code', 'POST'), {
      timeout: 20_000,
    }),
    target.getByLabel(/verification code/i).pressSequentially(code, { delay: 40 }),
  ]);
  return answer;
}

test('sign-up ends on the code screen — the address shown, never in the URL', async () => {
  await register(page, client);
  await page.waitForURL(/\/auth\/confirm-email\?from=register$/, { timeout: 30_000 });

  await expect(page.getByRole('heading', { name: /confirm your email/i })).toBeVisible();
  await expect(page.getByText(client.email, { exact: true })).toBeVisible();
  expect(page.url(), 'the address leaked into the URL').not.toContain('@');
  await expect(codeBox(), 'the code box should be ready to type into').toBeFocused();
  // A code was just sent, so the resend offer is a countdown, not a button.
  await expect(page.getByText(/resend in 0:\d\d/i)).toBeVisible();
});

test('the email leads with the code — in the subject too — and keeps the link as a fallback', async () => {
  const mail = await waitForCodeMail(client.email);
  firstCode = mail.code;
  firstMailId = mail.id;
  expect(linkIn(mail, APP_ORIGIN)).toMatch(/\/auth\/verify-email\?token=/);
});

test('a wrong code is refused on screen, the boxes clear, and nobody is signed in', async () => {
  const wrong = `${firstCode.slice(0, 5)}${(Number(firstCode.slice(5)) + 1) % 10}`;
  const answer = await typeCode(page, wrong);

  expect(answer.status()).toBe(400);
  expect(((await answer.json()) as { code?: string }).code).toBe('EMAIL_CODE_INVALID');
  // Filtered: Next's own route announcer is a `role="alert"` too.
  await expect(
    page.getByRole('alert').filter({ hasText: /incorrect or has expired/i }),
  ).toBeVisible();
  await expect(codeBox()).toHaveValue('');
  expect((await apiFromPage(page, 'GET', '/auth/me')).status).toBe(401);
});

test('a new code waits out the 30-second cooldown, and the old code dies with it', async () => {
  test.setTimeout(120_000);
  const resend = page.getByRole('button', { name: /send a new code/i });
  await expect(resend, 'the resend button never replaced the countdown').toBeVisible({
    timeout: 45_000,
  });

  const [answer] = await Promise.all([
    page.waitForResponse((r) => isApi(r, '/auth/resend-verification', 'POST')),
    resend.click(),
  ]);
  expect(answer.ok()).toBe(true);
  await expect(
    page.getByRole('status').filter({ hasText: /new code is on its way/i }),
  ).toBeVisible();
  // The clock starts again, so the next tap cannot be a request the server ignores.
  await expect(page.getByText(/resend in 0:\d\d/i)).toBeVisible();

  const fresh = await waitForCodeMail(client.email, { except: [firstMailId] });
  liveCode = fresh.code;
  liveLink = linkIn(fresh, APP_ORIGIN);

  // One in a million the two draws match; then there is no "old" code to try.
  if (firstCode !== liveCode) {
    const stale = await typeCode(page, firstCode);
    expect(stale.status(), 'a superseded code still worked').toBe(400);
    await expect(codeBox()).toHaveValue('');
  }
});

test('the right code signs the client in and lands on "verify now or later"', async () => {
  const answer = await typeCode(page, liveCode);
  expect(answer.status()).toBe(200);
  expect(await answer.text(), 'a token reached the response body').not.toMatch(/eyJ/);
  /*
   * The anti-forgery token rides back on a HEADER, as it does from sign-in:
   * across hosts the app cannot read the API's cookie, so without this the
   * first write after a code sign-in would be refused until a reload.
   */
  expect(answer.headers()['x-oxshare-csrf'], 'no anti-forgery token came back').toBeTruthy();

  await page.waitForURL(/\/onboarding$/, { timeout: 30_000 });
  await expect(
    page.getByRole('heading', { name: /complete your identity verification/i }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /step 1 of 2 complete/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /verify now/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /verify later/i })).toBeVisible();

  // The session is the server's: httpOnly, and invisible to this page's scripts.
  expect((await refreshCookie())?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/_rt=|_at=/);

  const me = await apiFromPage(page, 'GET', '/auth/me');
  expect(me.status).toBe(200);
  expect(me.body).toMatchObject({ email: client.email, emailVerified: true });

  // The hand-off between the screens is spent.
  expect(await page.evaluate(() => sessionStorage.getItem('oxshare.pending-email'))).toBeNull();
});

test('the session renews like any other — silently, when the access cookie lapses', async () => {
  const before = await refreshCookie();
  expect(before, 'the code sign-in left no refresh cookie').toBeDefined();
  spentRefresh = { name: before!.name, value: before!.value };

  await deleteCookie(context, /_at$/);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /complete your identity verification/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await refreshCookie())?.value, {
      timeout: 20_000,
      message: 'the refresh token never rotated after the access cookie was removed',
    })
    .not.toBe(before!.value);
  expect((await apiFromPage(page, 'GET', '/auth/me')).status).toBe(200);
});

test('"Verify now" opens the identity wizard; "Verify later" the dashboard', async () => {
  await page.getByRole('link', { name: /verify now/i }).click();
  await page.waitForURL(/\/kyc\/step\/\d+/, { timeout: 30_000 });

  await page.goto('/onboarding');
  await page.getByRole('link', { name: /verify later/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
});

test('neither the used code nor the emailed link can be spent again', async () => {
  const again = await page.request.post(`${API_NODE_BASE}/auth/verify-email-code`, {
    headers: { Origin: APP_ORIGIN },
    data: { email: client.email, code: liveCode },
  });
  expect(again.status()).toBe(400);
  expect(((await again.json()) as { code?: string }).code).toBe('EMAIL_CODE_INVALID');

  // The link in the same email answers "already used" — never "failed" — and
  // leads on to the same place the code did.
  await page.goto(liveLink);
  await expect(page.getByText(/already been used/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/verification failed/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveAttribute(
    'href',
    '/auth/login?next=%2Fonboarding',
  );
});

test('the code-minted session is a real refresh family — a replayed token ends it', async () => {
  test.setTimeout(120_000);
  /*
   * Consume the successor first. Inside the 30-second grace window a spent
   * token whose successor has never been presented is a lost-response RETRY
   * (R-3.3), not a theft — see session-matrix.spec.ts for the whole argument.
   */
  const current = await refreshCookie();
  await deleteCookie(context, /_at$/);
  await page.goto('/dashboard');
  await expect
    .poll(async () => (await refreshCookie())?.value, { timeout: 20_000 })
    .not.toBe(current?.value);

  // Replay the token the code sign-in first issued, from a jar of its own.
  const thief = await request.newContext();
  const replay = await thief.post(`${API_NODE_BASE}/auth/refresh`, {
    headers: {
      Origin: APP_ORIGIN,
      Cookie: `${spentRefresh!.name}=${spentRefresh!.value}`,
    },
  });
  await thief.dispose();
  expect(replay.status()).toBe(401);

  // The live tab is out on its next navigation: the whole family is dead.
  await deleteCookie(context, /_at$/);
  await page.goto('/dashboard').catch(() => null);
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 });
});

test('the confirmed client signs in with their password like anyone else', async () => {
  await signIn(page, client);
  const me = await apiFromPage(page, 'GET', '/auth/me');
  expect(me.body).toMatchObject({ email: client.email, emailVerified: true });
});

test.describe('an account that was never confirmed', () => {
  test('signs in with its password, is sent to the code screen, and a PASTED code finishes the sign-in where it was headed', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const late = newClient();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const tab = await ctx.newPage();

    await register(tab, late);
    await tab.waitForURL(/\/auth\/confirm-email/, { timeout: 30_000 });
    const first = await waitForCodeMail(late.email);

    // They leave without confirming, and come back later in a fresh tab.
    await tab.evaluate(() => sessionStorage.clear());
    // Past the resend cooldown, so the sign-in below can mail a NEW code.
    await tab.waitForTimeout(31_000);

    await tab.goto('/auth/login?next=%2Fwallet');
    await tab.getByPlaceholder('you@example.com').fill(late.email);
    await tab.locator('input[type="password"]').fill(late.password);
    const [login] = await Promise.all([
      tab.waitForResponse((r) => isApi(r, '/auth/login', 'POST')),
      tab.getByRole('button', { name: /^log in$/i }).click(),
    ]);
    expect(login.status()).toBe(403);
    expect(((await login.json()) as { code?: string }).code).toBe('EMAIL_NOT_VERIFIED');

    await tab.waitForURL(/\/auth\/confirm-email\?from=login&next=%2Fwallet$/, {
      timeout: 30_000,
    });
    await expect(tab.getByText(/finish signing in/i)).toBeVisible();
    await expect(tab.getByText(late.email, { exact: true })).toBeVisible();
    // The "already registered?" line belongs to sign-up only.
    await expect(tab.getByText(/already have an account with this email/i)).toHaveCount(0);

    // The sign-in mailed a NEW code; the one from registration is superseded.
    const fresh = await waitForCodeMail(late.email, { except: [first.id] });

    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP_ORIGIN });
    await tab.evaluate(
      (code) => navigator.clipboard.writeText(`${code} is your OxShare verification code`),
      fresh.code,
    );
    const [answer] = await Promise.all([
      tab.waitForResponse((r) => isApi(r, '/auth/verify-email-code', 'POST')),
      tab.getByRole('button', { name: /^paste$/i }).click(),
    ]);
    expect(answer.status()).toBe(200);

    // `?next=` survived the detour through the code screen.
    await tab.waitForURL(/\/wallet$/, { timeout: 30_000 });
    await ctx.close();
  });
});

test.describe('an address that already has an account', () => {
  test('gets the same code screen as a new one — the screen cannot tell them apart', async ({
    browser,
  }) => {
    /*
     * Registration answers identically for a new address and a taken one (the
     * owner of a taken one is emailed a sign-in link instead), so the screen
     * after it must be identical too, and say both things at once.
     */
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const tab = await ctx.newPage();
    await register(tab, { email: E2E_CLIENT.email, password: 'not-their-password-1' });
    await tab.waitForURL(/\/auth\/confirm-email\?from=register$/, { timeout: 30_000 });
    await expect(tab.getByRole('heading', { name: /confirm your email/i })).toBeVisible();
    await expect(tab.getByText(E2E_CLIENT.email, { exact: true })).toBeVisible();
    await expect(tab.getByText(/already have an account with this email/i)).toBeVisible();
    await ctx.close();
  });
});
