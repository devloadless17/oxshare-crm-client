import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { ADMIN_ORIGIN, API_NODE_BASE, adminApiSession, collectRejections } from './helpers';

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
let adminApi: Awaited<ReturnType<typeof adminApiSession>>['request'];
let adminCsrf: string;
let e2eClientId: string;

test.beforeAll(async () => {
  /*
   * Past ONE login-cap window. `adminApiSession` waits out the five-a-minute
   * cap rather than weakening it, and that 65-second backoff cannot fit inside
   * the default 60-second hook timeout — so on a busy run the whole file failed
   * in its setup, at 0ms, pointing at nothing it asserts.
   */
  test.setTimeout(180_000);
  // Through the shared helper: ONE login, and it WAITS on the five-a-minute
  // cap instead of failing the file when another suite just spent it.
  const session = await adminApiSession();
  adminApi = session.request;
  adminCsrf = session.csrf;

  const clients = await adminApi.get(
    `${API_NODE_BASE}/admin/clients?q=${encodeURIComponent(E2E_CLIENT_EMAIL)}&limit=5`,
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
  const credit = await adminApi.post(`${API_NODE_BASE}/admin/wallets/credit`, {
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
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });

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

  test('seeing is enough — closing the panel clears the badge and moves the row to Earlier', async ({
    page,
  }) => {
    /*
     * The owner's rule for the CLIENT bell (D-78): a notification the client
     * has seen is finished, so the bell must not keep counting it. The panel
     * marks what it SHOWED when it closes — on close, so nothing moves while it
     * is being read.
     */
    const reason = `E2E seen ${Date.now()}`;
    await creditWalletAsAdmin('5.00000000', reason);

    await page.goto('/dashboard');
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });

    await bell(page).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('link', { name: new RegExp(reason) })).toBeVisible();
    // Open: still new — nothing moved under the reader.
    await expect(panel.getByRole('tab', { name: /^new \(\d+\)$/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    // Closed: seen. The badge is the server's count, so this is a real round trip.
    await expect(bell(page)).not.toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });

    await bell(page).click();
    await expect(panel.getByText("You're all caught up")).toBeVisible();
    await panel.getByRole('tab', { name: 'Earlier' }).click();
    await expect(panel.getByRole('link', { name: new RegExp(reason) })).toBeVisible();
  });

  test('the cleared bell stays cleared across a reload', async ({ page }) => {
    await creditWalletAsAdmin('7.00000000', `E2E reload ${Date.now()}`);

    await page.goto('/dashboard');
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });
    await bell(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    /*
     * Closed before the badge is asserted, and not for tidiness: Radix marks
     * everything behind an open dialog `aria-hidden`, so the trigger is not
     * addressable by role while the panel is up.
     */
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await expect(bell(page)).not.toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });
    await page.reload();
    await expect(bell(page)).not.toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });
    // And there is no "Mark all" to press — seeing already did it.
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
