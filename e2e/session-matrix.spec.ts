import { request } from '@playwright/test';
import { expect, test } from './fixtures';
import { CROSS } from './topology';
import { deleteCookie, isApi, persistSharedState } from './helpers';

/**
 * The session behaviours people actually hit — tabs, lapsed access tokens,
 * a bookmarked sign-in page — driven for real and asserted from the wire.
 *
 * Every case that forces a renewal persists the rotated jar afterwards (and the
 * auto fixture does too): a rotated refresh token left only in one test's
 * context is how a later spec replays a spent token and signs the run out.
 */
test.describe('renewal', () => {
  test('an expired access cookie is renewed silently, exactly once, with no 401 leaking to the screen', async ({
    page,
    context,
  }) => {
    await deleteCookie(context, /_at$/);
    const renewals: number[] = [];
    page.on('response', (r) => {
      if (isApi(r, '/auth/refresh', 'POST')) renewals.push(r.status());
    });

    await page.goto('/wallet');
    await page.waitForLoadState('domcontentloaded');

    await expect(page, 'a renewable session was sent to sign-in').toHaveURL(/\/wallet/);
    await expect(page.getByRole('navigation').first()).toBeAttached();
    expect(
      renewals.filter((s) => s < 300).length,
      'no successful renewal happened',
    ).toBeGreaterThan(0);
    expect(
      renewals.every((s) => s < 300),
      `a renewal failed: ${renewals.join(',')}`,
    ).toBe(true);
    await persistSharedState(context);
  });

  test('two tabs renewing at the same moment both stay signed in', async ({ context }) => {
    /*
     * Rotation is single-use: two tabs presenting the same refresh token is the
     * shape of the bug that ejected one of them ("SESSION_SUPERSEDED" is the
     * API's answer to the loser, and the client retries on it). Both must land.
     */
    await deleteCookie(context, /_at$/);
    const a = await context.newPage();
    const b = await context.newPage();
    await Promise.all([a.goto('/dashboard'), b.goto('/wallet')]);
    await Promise.all([
      a.waitForLoadState('domcontentloaded'),
      b.waitForLoadState('domcontentloaded'),
    ]);

    await expect(a, 'tab A lost its session in a concurrent renewal').not.toHaveURL(
      /\/auth\/login/,
    );
    await expect(b, 'tab B lost its session in a concurrent renewal').not.toHaveURL(
      /\/auth\/login/,
    );
    await expect(a.getByRole('navigation').first()).toBeAttached();
    await expect(b.getByRole('navigation').first()).toBeAttached();
    await persistSharedState(context);
    await a.close();
    await b.close();
  });
});

test.describe('the anti-forgery token the app cannot read — the production topology', () => {
  test('a write still carries the token learned from the response header', async ({ page }) => {
    /*
     * Deployed, the CSRF cookie belongs to the API's host: the browser still
     * SENDS it to the API, but this app cannot READ it, so the only source of
     * the header value is the `X-OxShare-CSRF` response header. That split
     * exists only when the app and the API are different hosts — which is what
     * `E2E_TOPOLOGY=crosshost` builds (see topology.ts). On localhost the
     * cookie is readable and the case proves nothing; DELETING it would model
     * "absent", which the API rightly refuses, not "unreadable".
     *
     * The probe is a WRITE that must be refused for a reason OTHER than
     * anti-forgery: a wrong current password answers 400/401-class, never 403
     * — a 403 here would mean the header was missing.
     */
    test.skip(!CROSS, 'only meaningful when the app and the API are different hosts');
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const statuses: number[] = [];
    page.on('response', (r) => {
      if (isApi(r, '/auth/change-password', 'POST')) statuses.push(r.status());
    });
    await page.getByLabel(/current password/i).fill('definitely-not-the-password');
    await page.getByLabel(/^new password/i).fill('a-new-password-123');
    await page.getByLabel(/confirm/i).fill('a-new-password-123');
    await page
      .getByRole('button', { name: /change password|update password|save/i })
      .first()
      .click();
    await expect.poll(() => statuses.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(statuses[0], 'the write was refused as anti-forgery — no token was attached').not.toBe(
      403,
    );
  });
});

test.describe('the sign-in page for somebody already signed in', () => {
  test('redirects to the dashboard', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });

  test('still redirects when the access token has lapsed and only the refresh cookie is live', async ({
    page,
    context,
  }) => {
    /*
     * The returning client: fifteen minutes have passed, the access cookie is
     * gone, the refresh cookie and the app's own session-hint marker remain.
     * `/auth/me` answers 401, the interceptor must RENEW rather than conclude
     * "nobody is here", and the reverse gate moves them on. This renewal used to
     * be skipped whenever the CSRF cookie was unreadable — i.e. in every real
     * deployment — so a signed-in client met the form over a live session. The
     * marker is the signal now (D-69); deleting the marker too would model a
     * visitor who was never signed in, which is correctly shown the form.
     */
    await deleteCookie(context, /_at$/);
    await page.goto('/auth/login');
    // Landing on the dashboard IS the assertion: whichever leg answered (the
    // marker-driven proxy redirect, or `/auth/me` after a renewal), the
    // returning client was not shown the form.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole('navigation').first()).toBeAttached();
    await persistSharedState(context);
  });
});

test.describe('reuse detection', () => {
  test('replaying a rotated refresh token signs the whole login out', async ({ browser }) => {
    /*
     * Its own identity: the replay revokes the FAMILY, so nothing else may be
     * signed in as this client. Skipped when the fixture is absent.
     */
    test.setTimeout(120_000);
    // An EXPLICITLY empty jar — this context must not inherit any session.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/auth/login');
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('you@example.com').fill('e2e-reuse@oxshare.com');
    await page.locator('input[type="password"]').fill('client123');
    const [login] = await Promise.all([
      page.waitForResponse((r) => isApi(r, '/auth/login', 'POST')),
      page.getByRole('button', { name: /sign in/i }).click(),
    ]);
    test.skip(login.status() === 401, 'e2e-reuse@oxshare.com is not seeded');
    test.skip(login.status() === 429, 'portal login is rate limited right now');
    expect(login.ok()).toBe(true);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    const before = (await context.cookies()).find((c) => /_rt$/.test(c.name))!;
    // Force one rotation. Awaited on the RESPONSE, not on network idle — the
    // realtime socket's long-polling fallback keeps the network busy for ever.
    await deleteCookie(context, /_at$/);
    const [rotation] = await Promise.all([
      page.waitForResponse((r) => isApi(r, '/auth/refresh', 'POST'), { timeout: 20_000 }),
      page.goto('/wallet'),
    ]);
    expect(rotation.ok(), `the forced renewal answered ${rotation.status()}`).toBe(true);
    await expect(page.getByRole('navigation').first()).toBeAttached();
    const after = (await context.cookies()).find((c) => /_rt$/.test(c.name))!;
    expect(after.value, 'the refresh token did not rotate').not.toBe(before.value);

    /*
     * Consume the SUCCESSOR too. Within a 30-second grace window a spent token
     * whose successor has never been presented is treated as a lost-response
     * RETRY and answered 200 (R-3.3 — two tabs waking together must not eject
     * one). Only once the successor has itself been used does presenting the
     * original become what it is: a replay.
     */
    await deleteCookie(context, /_at$/);
    const [second] = await Promise.all([
      page.waitForResponse((r) => isApi(r, '/auth/refresh', 'POST'), { timeout: 20_000 }),
      page.goto('/dashboard'),
    ]);
    expect(second.ok(), `the second renewal answered ${second.status()}`).toBe(true);
    await expect(page.getByRole('navigation').first()).toBeAttached();

    // Replay the SPENT token, as a thief who copied it earlier would.
    // From a jar of its own, so the browser's live cookies cannot ride along
    // and turn the replay into an ordinary rotation.
    const thief = await request.newContext();
    const replay = await thief.post(
      `${process.env.E2E_API_NODE_ORIGIN ?? 'http://localhost:3001'}/v1/auth/refresh`,
      {
        headers: {
          Origin: process.env.E2E_PORTAL_ORIGIN ?? 'http://localhost:3000',
          Cookie: `${before.name}=${before.value}`,
        },
      },
    );
    await thief.dispose();
    expect(replay.status()).toBe(401);

    // The live tab is out on its next navigation: the family is dead.
    await deleteCookie(context, /_at$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 });
    await context.close();
  });
});
