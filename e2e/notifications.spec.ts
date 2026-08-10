import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import { collectRejections } from './helpers';

/**
 * The notification bell, as a signed-in client actually meets it.
 *
 * ## Why this is a browser test and not another `.test.tsx`
 *
 * `notifications-sheet.test.tsx` already mounts the panel in isolation and
 * asserts the badge, the fallback row and the mark-read calls. What it cannot
 * see is the SEAM this feature lives in: a bell rendered by the portal layout,
 * reading a cookie-authenticated endpoint through the Next rewrite, against a
 * real backend that writes the row inside a money transaction. Every bug this
 * file exists for lives between those parts — a 403 fired on every poll, a
 * badge that disagrees with the panel, an event whose row never arrives.
 *
 * ## The rows are made by REAL EVENTS, never inserted
 *
 * A test that seeds the table directly proves the reader works and nothing
 * about the writer. So this drives the actual admin action — a wallet credit —
 * through the admin API, and then asks the portal whether the client was told.
 * That is the whole feature: an event happened, therefore a person knows.
 */

const ADMIN = { email: 'admin@oxshare.com', password: 'admin123' };
const API = 'http://localhost:3001/v1';
/** The admin console's origin — the API validates it on every write. */
const ADMIN_ORIGIN = 'http://localhost:3002';

/** The client this project's storage state is signed in as. */
const E2E_CLIENT_EMAIL = 'e2e@oxshare.com';

/**
 * The admin session these specs act through — signed in ONCE for the file.
 *
 * Not once per test, and this is the same lesson `helpers.ts` records about
 * the portal's own login: admin sign-in is capped at five per minute per IP,
 * correctly, and a spec that authenticates per test spends that budget on
 * itself. A run that only goes green in isolation is one people stop
 * believing — so the session, the CSRF token and the client id are resolved
 * once and reused.
 */
let adminApi: Awaited<ReturnType<typeof apiRequest.newContext>>;
let adminCsrf: string;
let e2eClientId: string;

test.beforeAll(async () => {
  adminApi = await apiRequest.newContext();

  const login = await adminApi.post(`${API}/admin/auth/login`, {
    headers: { Origin: ADMIN_ORIGIN },
    data: ADMIN,
  });
  if (login.status() === 429) {
    throw new Error(
      'Rate limited signing in as the admin: POST /admin/auth/login answered 429. The cap is ' +
        'five per minute and it is not the thing under test — wait a minute and re-run.',
    );
  }
  expect(login.ok(), `admin sign-in answered ${login.status()}`).toBeTruthy();

  // The CSRF token is the one cookie readable by JS, by design — the same
  // contract the admin console itself uses on every write.
  const { cookies } = await adminApi.storageState();
  adminCsrf = cookies.find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  expect(adminCsrf, 'the admin session carried no CSRF cookie').toBeTruthy();

  const clients = await adminApi.get(
    `${API}/admin/clients?q=${encodeURIComponent(E2E_CLIENT_EMAIL)}&limit=5`,
  );
  expect(clients.ok(), `client lookup answered ${clients.status()}`).toBeTruthy();
  const found = ((await clients.json()) as { items: { id: string; email: string }[] }).items.find(
    (c) => c.email === E2E_CLIENT_EMAIL,
  );
  expect(found, `${E2E_CLIENT_EMAIL} is not seeded — run the backend so seeds apply`).toBeTruthy();
  e2eClientId = found?.id ?? '';
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

/**
 * Credit the e2e client's wallet as a real admin, over the real API.
 *
 * Over the API rather than a second browser: the admin console is a different
 * origin with different cookies, and driving its UI here would make a failure
 * in the admin app read as a failure of the portal's bell.
 */
async function creditWalletAsAdmin(
  amount: string,
  reason: string,
): Promise<{ transactionId: string }> {
  const credit = await adminApi.post(`${API}/admin/wallets/credit`, {
    headers: {
      Origin: ADMIN_ORIGIN,
      'x-oxshare-csrf': adminCsrf,
      // Every credit is one intent; a unique key per call keeps two tests from
      // converging on ONE transaction through the idempotency constraint.
      'idempotency-key': `e2e-notify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    data: { userId: e2eClientId, amount, currency: 'USD', reason },
  });
  expect(credit.ok(), `wallet credit answered ${credit.status()}`).toBeTruthy();

  const body = (await credit.json()) as { transaction: { id: string } };
  return { transactionId: body.transaction.id };
}

/** The bell, by its accessible name — it has no other handle. */
function bell(page: Page) {
  return page.getByRole('button', { name: /open notifications/i });
}

test.describe('the notification bell', () => {
  test('a real admin credit reaches the client as a badge and a row', async ({ page }) => {
    const rejections = collectRejections(page);
    const reason = `E2E bell check ${Date.now()}`;

    await creditWalletAsAdmin('12.34000000', reason);

    await page.goto('/dashboard');
    // The badge is polled, so it is awaited rather than asserted immediately —
    // the count query resolves after first paint.
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: 20_000 });

    await bell(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    /*
     * Located by the run's OWN reason string, not by the kind's title: the
     * feed accumulates across runs, so "Wallet credited" matches every row a
     * previous run left behind. Asserting on this run's row is both strict-
     * mode safe and the stronger claim — it is THIS event that arrived.
     */
    const row = page.getByRole('link', { name: new RegExp(reason) });
    await expect(row).toBeVisible();
    // The COPY, not the slug: an unrendered kind would read "Notification".
    await expect(row).toContainText('Wallet credited');
    // Money formatted through decimal.js, and the reason interpolated — an
    // unfilled placeholder would render a literal `{amount}`.
    await expect(row).toContainText('$12.34');
    await expect(page.getByRole('dialog')).not.toContainText('{');

    // Nothing was refused on the way — a 403 per poll is invisible in the UI.
    expect(rejections.list(), 'the bell was refused by the API').toEqual([]);
  });

  test('opening marks NOTHING read; clicking a row does', async ({ page }) => {
    await creditWalletAsAdmin('5.00000000', `E2E explicit-read ${Date.now()}`);

    await page.goto('/dashboard');
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: 20_000 });

    // Open and close again: the unread signal must survive being looked at.
    await bell(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(bell(page)).toHaveAccessibleName(/unread/i);

    // Clicking the row marks it and navigates to where the money is.
    await bell(page).click();
    await page
      .getByRole('link', { name: /wallet credited/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/wallet/);
  });

  test('"Mark all as read" clears the badge, and stays cleared across a reload', async ({
    page,
  }) => {
    await creditWalletAsAdmin('7.00000000', `E2E mark-all ${Date.now()}`);

    await page.goto('/dashboard');
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: 20_000 });

    await bell(page).click();
    await page.getByRole('button', { name: /mark all as read/i }).click();

    /*
     * Closed before the badge is asserted, and not for tidiness: Radix marks
     * everything behind an open dialog `aria-hidden`, so the trigger is not
     * addressable by role while the panel is up. Asserting through it reports
     * "waiting for getByRole(button)" — which reads as a missing bell rather
     * than a hidden one.
     */
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // The badge is derived from the server, so this is a real round trip —
    // not a local flag that a reload would contradict.
    await expect(bell(page)).not.toHaveAccessibleName(/unread/i, { timeout: 20_000 });
    await page.reload();
    await expect(bell(page)).not.toHaveAccessibleName(/unread/i, { timeout: 20_000 });

    await bell(page).click();
    await expect(page.getByRole('button', { name: /mark all as read/i })).toHaveCount(0);
  });

  test('the panel is reachable and honest on every screen the layout mounts on', async ({
    page,
  }) => {
    const rejections = collectRejections(page);

    for (const route of ['/dashboard', '/wallet', '/transactions', '/profile']) {
      await page.goto(route);
      await expect(bell(page), `${route} lost the bell`).toBeVisible();
      await bell(page).click();
      // Either real rows or the real empty state — never a preview notice,
      // and never a fabricated event.
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog')).not.toContainText(/not live yet|preview/i);
      await page.keyboard.press('Escape');
    }

    expect(rejections.list(), 'a page refused the notifications endpoints').toEqual([]);
  });
});
