import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { ADMIN_ORIGIN, API_NODE_BASE, adminApiSession, apiFromPage } from './helpers';

/**
 * The bell updates WITHOUT a refresh.
 *
 * ## Why this test exists and the unit tests do not replace it
 *
 * `use-realtime.test.ts` proves the hook drives a fake socket correctly, and
 * `notifications-realtime.spec.ts` in the backend proves Postgres announces a
 * committed row. Neither proves the thing a person actually cares about: that a
 * page which has been sitting open, untouched, shows the new notification on
 * its own.
 *
 * Everything between those two proofs has to work for that to happen — the
 * trigger, the LISTEN connection, the gateway's room routing, the cookie
 * authenticating a handshake that carries no Authorization header, the CSP
 * actually permitting `ws:` to a DIFFERENT origin than the API, Socket.IO's
 * upgrade, React Query's invalidation, and the render. That chain is only
 * testable in a browser, and most of it has no HTTP request to assert on.
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
 * portal polls the unread count every 60 seconds when the socket is down and
 * every 5 minutes when it is up, so anything appearing inside a few seconds
 * cannot have come from a poll.
 */

const E2E_CLIENT_EMAIL = 'e2e@oxshare.com';

/**
 * Anything arriving faster than this cannot be the poll.
 *
 * The fallback poll is 60s at its fastest. Five seconds leaves room for a
 * loaded CI box while staying an order of magnitude clear of it.
 */
const REALTIME_BUDGET_MS = 5_000;

/**
 * The same property, measured on the RECONNECT path, which costs strictly more
 * than a push: the browser must first notice the socket is gone, then back off,
 * then re-establish (or fall through to long-polling), and only then can the
 * refetch land. `REALTIME_BUDGET_MS` covers a push arriving on a socket that is
 * already open, and using it for both conflated two different budgets.
 *
 * Not a weakening. The discriminator is the 60s fallback poll — "anything
 * arriving faster than this cannot be the poll" — and 15s is still four times
 * clear of it, so a completely broken reconnect still fails here exactly as it
 * did at five seconds.
 *
 * The number is measured, not guessed. At 5s this case failed on chromium in a
 * full crosshost run (6.3s) while PASSING on mobile in that same run and 3/3 on
 * chromium in isolation — the signature of machine load, not of a defect.
 */
const RECONNECT_BUDGET_MS = 15_000;

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
  // Signed in ONCE for the file — admin login is capped at five per minute,
  // the trap `helpers.ts` records about the portal's own login.
  // Through the shared helper: ONE login, and it WAITS on the five-a-minute
  // cap instead of failing the file when another suite just spent it.
  const session = await adminApiSession();
  adminApi = session.request;
  adminCsrf = session.csrf;

  const clients = await adminApi.get(
    `${API_NODE_BASE}/admin/clients?q=${encodeURIComponent(E2E_CLIENT_EMAIL)}&limit=5`,
  );
  // Checked before parsing: a 403 or 429 here would otherwise surface as a
  // TypeError on `.items`, hiding the actual reason behind a stack trace.
  expect(clients.ok(), `the client lookup answered ${clients.status()}`).toBeTruthy();
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
  const credit = await adminApi.post(`${API_NODE_BASE}/admin/wallets/credit`, {
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
 * Driven over the API rather than through the panel, deliberately. The panel
 * has no "Mark all" button any more — closing it marks what it SHOWED (D-78) —
 * and that depends on which rows had rendered, which is exactly the race a
 * setup step must not have.
 *
 * This is SETUP, so it may reload; the assertions afterwards never do, which
 * is the property the marker proves.
 */
async function markEverythingRead(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(bell(page)).toBeVisible();

  /*
   * Through the page's own cookies, with the CSRF header taken from Playwright's
   * jar — the page cannot read the API host's cookie wherever the two hosts
   * differ, and the suite must not depend on them being the same.
   */
  const cleared = await apiFromPage(page, 'POST', '/notifications/read-all');
  expect(cleared.status, `read-all answered ${cleared.status}`).toBeLessThan(300);

  await page.reload();
  await expect(bell(page)).not.toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });
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
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: REALTIME_BUDGET_MS });

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

    // `.first()`: the same sentence now also arrives as a toast, so the text
    // resolves to two elements — the row in the open panel is the one asserted.
    await expect(page.getByText(reason).first()).toBeVisible({ timeout: REALTIME_BUDGET_MS });
    expect(await markerSurvived(page)).toBe(true);
  });

  test('the socket names the event for the authenticated room; the row itself is refetched', async ({
    page,
  }) => {
    /*
     * Asserted from the wire itself — the realtime transport, both legs:
     * Socket.IO starts on HTTP long-polling and upgrades to a WebSocket, and an
     * event that lands before the upgrade travels in a polling response.
     *
     * What the frame carries is `id`, `kind` and the row's `params`, emitted
     * to the ROOM of the principal the row names (authenticated at the
     * handshake) — the gateway's own note records that the room is the
     * permission boundary, so `params` reaches exactly the reader
     * `GET /notifications` would have served. The portal still refetches the
     * row over the authenticated endpoint rather than rendering the frame.
     * This test used to assert the frame carried NO body; that predates the
     * decision to ship `params`, and would now be asserting against the design.
     */
    const isRealtime = (url: string) => url.includes('/socket.io/');
    const frames: string[] = [];
    page.on('websocket', (ws) => {
      if (!isRealtime(ws.url())) return;
      ws.on('framereceived', (frame) => frames.push(frame.payload.toString()));
    });
    page.on('response', (r) => {
      if (isRealtime(r.url()) && r.url().includes('transport=polling')) {
        void r
          .text()
          .then((t) => frames.push(t))
          .catch(() => undefined);
      }
    });

    await markEverythingRead(page);

    /*
     * ⚠️ WAIT FOR THE SOCKET BEFORE CAUSING THE EVENT.
     *
     * `markEverythingRead` RELOADS, which destroys the socket and opens a new
     * one, and Socket.IO has no replay: an event emitted while that handshake
     * is still in flight is delivered to nobody and is gone. This test then
     * failed on its own subject while the feature worked — the badge still
     * appeared, because the reconnect handler re-syncs over HTTP, so the only
     * symptom was the frame assertion.
     *
     * `40/realtime` is the Engine.IO frame for "namespace joined", which is
     * exactly the moment the room exists to be emitted into. Waiting on the
     * transport's own signal rather than on a sleep, so this cannot rot into a
     * timing guess on a slower machine.
     */
    await expect
      .poll(() => frames.some((f) => f.includes('40/realtime')), {
        timeout: 20_000,
        message: 'the realtime socket never joined its namespace',
      })
      .toBe(true);

    const reason = `Realtime payload check ${Date.now()}`;
    await creditWallet('1.23000000', reason);
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: 20_000 });

    // The transport spoke, and said which event — otherwise the badge could
    // have come from a poll and this test would rot into silence. Polled,
    // because the frame and the DOM update race by a few milliseconds.
    /*
     * REPORT WHAT THE SOCKET ACTUALLY SAID, not just that the string was absent.
     *
     * This fails in CI on [mobile] and passes locally, repeatedly, and "expected
     * true, received false" cannot tell the two candidates apart: a socket that
     * was SILENT (so the badge above came from the 60s poll, which is the defect
     * this assertion exists to catch) versus a socket that spoke and used a name
     * this check does not match.
     *
     * Those want opposite fixes, so the message now carries the distinct frame
     * kinds seen. Same approach that resolved `onboarding-journey:94`, which had
     * survived several runs describing a missing element and named its own cause
     * — a 429 — on the first run after it was instrumented.
     */
    const seen = () => {
      const kinds = new Set<string>();
      for (const f of frames) {
        for (const m of f.matchAll(/"([a-z_]+\.[a-z_]+)"/g)) if (m[1]) kinds.add(m[1]);
      }
      return [...kinds];
    };

    await expect
      .poll(() => frames.join('\n').includes('notification.created'), {
        timeout: REALTIME_BUDGET_MS * 2,
        message:
          'the socket never carried `notification.created`. If it carried NOTHING, the bell ' +
          'above was updated by the poll and the realtime path is not working; if it carried ' +
          'other events, this check is matching the wrong name. Frame kinds seen: ' +
          `[${seen().join(', ')}] across ${frames.length} frames.`,
      })
      .toBe(true);
  });

  test('recovers on its own after the connection drops', async ({ page, context }) => {
    /*
     * The failure that matters most in production: a proxy or a laptop lid
     * kills the socket. Socket.IO reconnects by itself, and underneath it the
     * poll keeps running — so the bell must catch up either way, with no human
     * action.
     *
     * `setOffline` rather than route-blocking: Playwright's request routing
     * does not intercept a WebSocket, so blocking a URL would break nothing
     * and the test would pass without ever dropping the connection.
     */
    /*
     * The socket is watched so this test can PROVE it dropped and came back.
     * Without that it passes whether or not reconnection works at all — the
     * 60-second poll would carry the badge on its own, which is exactly the
     * fallback this test is supposed to be looking past.
     *
     * Attached BEFORE the first navigation: `page.on('websocket')` only reports
     * sockets opened after it is registered, so listening later would watch
     * nothing and count zero forever.
     */
    let closed = 0;
    let opened = 0;
    page.on('websocket', (ws) => {
      opened += 1;
      ws.on('close', () => {
        closed += 1;
      });
    });

    await markEverythingRead(page);
    // The page must actually have a socket before dropping it means anything.
    await expect.poll(() => opened, { timeout: 20_000 }).toBeGreaterThan(0);

    await plantMarker(page);

    await context.setOffline(true);
    // Long enough for the browser to notice the socket is gone.
    await expect.poll(() => closed, { timeout: 20_000 }).toBeGreaterThan(0);
    await context.setOffline(false);

    /*
     * Deliberately NOT asserting that a new WebSocket opens.
     *
     * Recovery over long-polling is equally correct — that is the whole point
     * of `tryAllTransports` — and it creates no WebSocket to observe. Requiring
     * one would fail the test for taking the fallback it is supposed to allow.
     * The timing assertion below is what actually proves the transport is back.
     */
    const reason = `Realtime recovery ${Date.now()}`;
    await creditWallet('2.34000000', reason);

    /*
     * Under the POLL budget, deliberately. Allowing 90s here would let a
     * completely broken reconnect pass on the 60-second fallback; holding it
     * well beneath that fallback means the reconnected transport is what
     * delivered this. See `RECONNECT_BUDGET_MS` for why this one case gets a
     * larger budget than a push does, and why 15s still proves the same thing.
     */
    await expect(bell(page)).toHaveAccessibleName(/\d+ new/i, { timeout: RECONNECT_BUDGET_MS });
    expect(await markerSurvived(page)).toBe(true);
  });
});

test.describe('the BALANCE updates without a refresh, not just the bell', () => {
  /**
   * ⚠️ THE REPORTED BUG: "when I fund a wallet the result doesn't appear in
   * the wallet directly until I refresh."
   *
   * The bell tests above passed throughout it, and that is the point. The
   * socket was fine, the toast was fine, the badge was fine — and
   * `queryKeysFor` mapped `wallet.credited` to `[]`, so the one thing the
   * client actually opened the page for did not move. A live notification
   * about money, over a stale balance, is worse than no notification: it
   * tells somebody the money arrived and then shows them it did not.
   *
   * `rebate.credited` and `commission.confirmed` had the same hole and are
   * covered by `notification-kinds.test.ts`, which asserts all three refresh
   * the wallet — they are harder to trigger from here (an ingested MT5 deal
   * and an hourly confirm job) and the invalidation is identical.
   */

  /** The headline figure on the client's own wallet card. */
  const balanceText = async (page: Page): Promise<string> => {
    const heading = page.locator('p.tabular-nums').first();
    await expect(heading).toBeVisible({ timeout: 20_000 });
    return (await heading.textContent()) ?? '';
  };

  test('an operator crediting the wallet moves the figure the client is looking at', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/wallet');
    const before = await balanceText(page);

    // Same-document proof: this must not pass by way of a reload.
    await plantMarker(page);

    // A real admin action against the real endpoint — the exact thing the
    // owner did by hand when he found this.
    await creditWallet('7.77000000', 'e2e realtime balance');

    await expect
      .poll(async () => balanceText(page), {
        timeout: REALTIME_BUDGET_MS,
        message: 'the credited amount never reached the balance on screen',
      })
      .not.toBe(before);

    expect(await markerSurvived(page), 'the page reloaded — this proves nothing').toBe(true);
  });

  test('the dashboard tiles move with it', async ({ page }) => {
    /*
     * The dashboard reads a DIFFERENT key from the wallet — one request
     * carrying wallets, transactions and five server-side counts — so it went
     * stale independently. A client who lands on the dashboard after a
     * deposit is the common case, not an edge one.
     */
    test.setTimeout(120_000);
    await page.goto('/dashboard');
    const tiles = page.locator('main');
    await expect(tiles).toBeVisible({ timeout: 20_000 });
    const before = (await tiles.textContent()) ?? '';
    await plantMarker(page);

    await creditWallet('3.33000000', 'e2e realtime dashboard');

    await expect
      .poll(async () => (await tiles.textContent()) ?? '', {
        timeout: REALTIME_BUDGET_MS,
        message: 'the dashboard did not reflect a credit',
      })
      .not.toBe(before);
    expect(await markerSurvived(page), 'the page reloaded — this proves nothing').toBe(true);
  });
});
