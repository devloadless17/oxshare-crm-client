import { request } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApiSession,
  API_NODE_BASE,
  APP_ORIGIN,
  deleteCookie,
  linkIn,
  newClient,
  routeHit,
  isApi,
  waitForMail,
  requirePrecondition,
  VERIFICATION_SUBJECT,
} from './helpers';

/**
 * The portal under session STRESS — the twin of the admin suite's
 * session-under-stress.spec.ts, plus the one cross-surface case nothing
 * proved from the client's side: an ADMIN changing a client's sign-in email
 * revokes every portal session, and the client actually experiences it.
 */

const PAGES = ['/dashboard', '/wallet', '/transactions', '/profile'] as const;

test.describe('every page renders after a silent renewal', () => {
  for (const path of PAGES) {
    test(`${path} recovers from a lapsed access token with one refresh`, async ({ page }) => {
      await deleteCookie(page.context(), /_at$/);
      const refresh = await routeHit(page, '/auth/refresh', (route) => route.continue());

      await page.goto(path);
      expect(new URL(page.url()).pathname, `${path} bounced to sign-in`).toBe(path);
      await expect
        .poll(() => refresh.hits(), { timeout: 15_000, message: 'no silent refresh fired' })
        .toBeGreaterThan(0);
      expect(refresh.hits(), 'more than one refresh for one lapse').toBeLessThanOrEqual(2);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  }
});

test('a deleted session-hint on a LIVE session self-heals on a private route', async ({ page }) => {
  await page.goto('/dashboard');
  await deleteCookie(page.context(), /session_hint/);
  await page.goto('/wallet');
  expect(new URL(page.url()).pathname, 'a live session met the sign-in form').toBe('/wallet');
});

test('an admin changing the sign-in email ends the live portal session', async ({ browser }) => {
  test.setTimeout(300_000);
  /*
   * test/admin-client-edit-http.spec.ts proves the API revokes every portal
   * session on an email change; this proves the CLIENT EXPERIENCES it — the
   * open portal tab meets the sign-in screen, because the address they signed
   * in with is no longer the account's address.
   */
  const client = newClient();
  const boot = await request.newContext({ storageState: { cookies: [], origins: [] } });
  const origin = { Origin: APP_ORIGIN };
  const admin = await adminApiSession();
  try {
    const reg = await boot.post(`${API_NODE_BASE}/auth/register`, {
      headers: origin,
      data: {
        email: client.email,
        password: client.password,
        firstName: 'Email',
        lastName: 'Rotation',
      },
    });
    requirePrecondition(reg.status() === 429, 'registration is rate limited right now (10/h)');
    expect(reg.ok(), `register answered ${reg.status()}`).toBe(true);
    const mail = await waitForMail(client.email, { subject: VERIFICATION_SUBJECT });
    const token = new URL(linkIn(mail, APP_ORIGIN)).searchParams.get('token')!;
    expect(
      (
        await boot.post(`${API_NODE_BASE}/auth/verify-email`, { headers: origin, data: { token } })
      ).ok(),
    ).toBe(true);
    /*
     * SIGNED IN THROUGH THE BROWSER, not by handing it Node's cookie jar.
     *
     * This used to log in with the `boot` request context and transfer
     * `storageState()` into the browser. That works on localhost and CANNOT work
     * cross-host, which is the topology this suite exists to reproduce:
     * `topology.ts` dials the API from Node as `localhost:PORT` — deliberately,
     * "the same server, by a name Node resolves" — while the browser dials
     * `api.crm.localhost:PORT`. The session cookies are scoped to the host that
     * set them, so the jar handed over was for a host the page never talks to,
     * the dashboard rendered signed-out, and the wallet link never appeared.
     *
     * It failed as "the product did not render a link". It was the harness
     * assuming one host. Signing in through the form puts the cookies on the
     * host the browser actually uses, which is true in BOTH topologies — and it
     * is also the journey a client makes, which the transfer never was.
     *
     * Found by running crosshost for the first time; it had been passing on
     * localhost and silently topology-dependent.
     */
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    try {
      await page.goto('/auth/login');
      await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('you@example.com').fill(client.email);
      await page.locator('input[type="password"]').fill(client.password);
      const [login] = await Promise.all([
        page.waitForResponse((r) => isApi(r, '/auth/login', 'POST')),
        page.getByRole('button', { name: /^log in$/i }).click(),
      ]);
      requirePrecondition(login.status() === 429, 'portal login is rate limited right now');
      expect(login.ok(), `portal sign-in answered ${login.status()}`).toBe(true);

      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /wallet/i }).first()).toBeVisible();

      const found = await admin.get(`/admin/clients?q=${encodeURIComponent(client.email)}&limit=5`);
      const id = ((await found.json()) as { items: { id: string; email: string }[] }).items.find(
        (c) => c.email === client.email,
      )?.id;
      expect(id, 'the fresh client is not on the admin index').toBeTruthy();

      const changed = await admin.patch(`/admin/clients/${id}/email`, {
        email: client.email.replace('@', '.rotated@'),
      });
      expect(changed.ok(), `email change answered ${changed.status()}`).toBe(true);

      // The live tab's next navigation meets the sign-in screen — not in
      // fifteen minutes, NOW.
      await page.goto('/wallet').catch(() => null);
      await page.waitForURL(/\/auth\/login/, { timeout: 20_000 });
    } finally {
      await ctx.close();
    }
  } finally {
    await boot.dispose();
    await admin.dispose();
  }
});
