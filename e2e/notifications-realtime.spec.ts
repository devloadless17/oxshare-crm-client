import { expect, request as apiRequest, test, type Page } from '@playwright/test';

/**
 * The bell updates WITHOUT a refresh.
 *
 * ## Why this test exists and the unit tests do not replace it
 *
 * `use-notification-stream.test.ts` proves the hook drives a fake
 * `EventSource` correctly, and `notifications-realtime.spec.ts` in the backend
 * proves Postgres announces a committed row. Neither proves the thing a person
 * actually cares about: that a page which has been sitting open, untouched,
 * shows the new notification on its own.
 *
 * Everything between those two proofs has to work for that to happen — the
 * trigger, the LISTEN connection, the SSE handler, Next's rewrite proxying a
 * stream rather than buffering it, the browser's EventSource, React Query's
 * invalidation, and the render. That chain is only testable in a browser.
 *
 * ## How it proves "no refresh" rather than assuming it
 *
 * A marker is planted on `window` before the event and asserted afterwards. A
 * reload or a client-side navigation would destroy it, so a passing assertion
 * is positive evidence the same document is still on screen — not merely the
 * absence of a `page.reload()` call in the test.
 *
 * ## And "realtime" rather than "eventually"
 *
 * The badge is awaited with a timeout FAR below the polling fallback. The
 * portal polls the unread count every 60 seconds when the stream is down and
 * every 5 minutes when it is up, so anything appearing inside a few seconds
 * cannot have come from a poll.
 */

const ADMIN = { email: 'admin@oxshare.com', password: 'admin123' };
const API = 'http://localhost:3001/v1';
const ADMIN_ORIGIN = 'http://localhost:3002';
const E2E_CLIENT_EMAIL = 'e2e@oxshare.com';

/**
 * Anything arriving faster than this cannot be the poll.
 *
 * The fallback poll is 60s at its fastest. Five seconds leaves room for a
 * loaded CI box while staying an order of magnitude clear of it.
 */
const REALTIME_BUDGET_MS = 5_000;

let adminApi: Awaited<ReturnType<typeof apiRequest.newContext>>;
let adminCsrf: string;
let e2eClientId: string;

test.beforeAll(async () => {
  // Signed in ONCE for the file — admin login is capped at five per minute,
  // the trap `helpers.ts` records about the portal's own login.
  adminApi = await apiRequest.newContext();

  const login = await adminApi.post(`${API}/admin/auth/login`, {
    headers: { Origin: ADMIN_ORIGIN },
    data: ADMIN,
  });
  if (login.status() === 429) {
    throw new Error(
      'Rate limited signing in as the admin (429). The cap is five per minute and is not the ' +
        'thing under test — wait a minute and re-run.',
    );
  }
  expect(login.ok(), `admin sign-in answered ${login.status()}`).toBeTruthy();

  const { cookies } = await adminApi.storageState();
  adminCsrf = cookies.find((c) => c.name.includes('admin_csrf'))?.value ?? '';
  expect(adminCsrf, 'the admin session carried no CSRF cookie').toBeTruthy();

  const clients = await adminApi.get(
    `${API}/admin/clients?q=${encodeURIComponent(E2E_CLIENT_EMAIL)}&limit=5`,
  );
  const found = ((await clients.json()) as { items: { id: string; email: string }[] }).items.find(
    (c) => c.email === E2E_CLIENT_EMAIL,
  );
  expect(
    found,
    `${E2E_CLIENT_EMAIL} is not seeded — start the backend so seeds apply`,
  ).toBeTruthy();
  e2eClientId = found?.id ?? '';
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

/** Credit the e2e client's wallet as a real admin — a genuine domain event. */
async function creditWallet(amount: string, reason: string): Promise<void> {
  const credit = await adminApi.post(`${API}/admin/wallets/credit`, {
    headers: {
      Origin: ADMIN_ORIGIN,
      'x-oxshare-csrf': adminCsrf,
      'idempotency-key': `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    data: { userId: e2eClientId, amount, currency: 'USD', reason },
  });
  expect(credit.ok(), `wallet credit answered ${credit.status()}`).toBeTruthy();
}

const bell = (page: Page) => page.getByRole('button', { name: /open notifications/i });

/**
 * Clear the slate so an existing badge cannot make a stale test pass.
 *
 * Driven over the API rather than through the panel, deliberately. Clicking
 * "Mark all as read" races the list's first render — the button does not exist
 * until rows arrive, so a visibility check taken too early silently skips the
 * clear and leaves the very badge this is supposed to remove.
 *
 * This is SETUP, so it may reload; the assertions afterwards never do, which
 * is the property the marker proves.
 */
async function markEverythingRead(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(bell(page)).toBeVisible();

  // The CSRF token is the one cookie readable by JS, by design — the same
  // contract the portal itself uses on every state change.
  const csrf = await page.evaluate(() => {
    const match = /(?:^|;\s*)oxshare_crm_portal_csrf=([^;]+)/.exec(document.cookie);
    return match?.[1] ?? '';
  });
  expect(csrf, 'the portal session carried no CSRF cookie').toBeTruthy();

  // `page.request` shares the browser context's cookies, so this is the
  // signed-in client acting on their own feed.
  const cleared = await page.request.post('http://localhost:3000/api/notifications/read-all', {
    headers: { 'x-oxshare-csrf': csrf, Origin: 'http://localhost:3000' },
  });
  expect(cleared.ok(), `read-all answered ${cleared.status()}`).toBeTruthy();

  await page.reload();
  await expect(bell(page)).not.toHaveAccessibleName(/unread/i, { timeout: 20_000 });
}

/** Plant a value that only survives if the document is never replaced. */
async function plantMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __oxshareNoReload?: string }).__oxshareNoReload = 'same-document';
  });
}

async function markerSurvived(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __oxshareNoReload?: string }).__oxshareNoReload === 'same-document',
  );
}

test.describe('the bell updates without a refresh', () => {
  test('a badge appears on an idle page, within realtime budget', async ({ page }) => {
    await markEverythingRead(page);
    await plantMarker(page);

    const reason = `Realtime badge ${Date.now()}`;
    await creditWallet('4.56000000', reason);

    // Nothing is clicked, reloaded or navigated between the credit and this.
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: REALTIME_BUDGET_MS });

    expect(
      await markerSurvived(page),
      'the page reloaded — the badge proves nothing about realtime',
    ).toBe(true);
  });

  test('an OPEN panel gains the new row while it is being looked at', async ({ page }) => {
    /*
     * The harder case, and the one a person actually experiences: the panel is
     * already open. Nothing here re-opens it — if the row appears, the list
     * was invalidated and refetched underneath a mounted component.
     */
    await markEverythingRead(page);
    await bell(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await plantMarker(page);

    const reason = `Realtime open panel ${Date.now()}`;
    await creditWallet('7.89000000', reason);

    await expect(page.getByText(reason)).toBeVisible({ timeout: REALTIME_BUDGET_MS });
    expect(await markerSurvived(page)).toBe(true);
  });

  test('the stream carries no notification body — the row is refetched, not pushed', async ({
    page,
  }) => {
    /*
     * A privacy property, asserted from the wire.
     *
     * The SSE frame deliberately carries only an id and a kind: the content is
     * re-read over the authenticated endpoint, so a notification body never
     * travels outside a permission-checked read, and the 8000-byte NOTIFY
     * channel never has to hold a rejection reason.
     */
    const frames: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/notifications/stream')) frames.push(response.url());
    });

    await markEverythingRead(page);
    const reason = `Realtime payload check ${Date.now()}`;

    const streamBodies: string[] = [];
    await page.route('**/notifications/stream', async (route) => {
      const response = await route.fetch();
      streamBodies.push(await response.text().catch(() => ''));
      await route.fulfill({ response });
    });

    await creditWallet('1.23000000', reason);
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: 20_000 });

    // Whatever the stream said, it did not say this.
    expect(streamBodies.join('\n')).not.toContain(reason);
  });

  test('recovers on its own after the connection drops', async ({ page, context }) => {
    /*
     * The failure that matters most in production: a proxy or a laptop lid
     * kills the stream. `EventSource` reconnects by itself, and underneath it
     * the poll keeps running — so the bell must catch up either way, with no
     * human action.
     */
    await markEverythingRead(page);
    await plantMarker(page);

    // Break every future stream attempt, then let it heal.
    await context.route('**/notifications/stream', (route) => route.abort());
    await page.waitForTimeout(1_000);
    await context.unroute('**/notifications/stream');

    const reason = `Realtime recovery ${Date.now()}`;
    await creditWallet('2.34000000', reason);

    // Generous: this may be carried by the reconnected stream OR by the
    // 60-second fallback poll. Either is a pass — the point is that it
    // arrives without anybody touching the page.
    await expect(bell(page)).toHaveAccessibleName(/unread/i, { timeout: 90_000 });
    expect(await markerSurvived(page)).toBe(true);
  });
});
