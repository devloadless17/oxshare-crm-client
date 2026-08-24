import { request } from '@playwright/test';
import { expect, test } from './fixtures';
import { API_NODE_BASE, APP_ORIGIN, isApi, linkIn, newClient, waitForMail } from './helpers';

/**
 * FR-CORE-03 password recovery, A→Z, on a client minted for this run:
 *
 *   forgot-password from the SIGN-IN screen → the emailed link → a new
 *   password → the old one is dead, the new one works, the link is spent,
 *   and every session that existed BEFORE the reset is signed out.
 *
 * The last clause is the point of recovery: someone resets because they fear
 * the old credential is in the wrong hands, so a session that credential
 * opened must not survive it (`passwordChangedAt` versus token `iat`).
 */

test.describe.configure({ mode: 'serial' });
test.use({ storageState: { cookies: [], origins: [] } });

const client = newClient();
let resetToken = '';

test('the whole recovery journey, end to end', async ({ page }) => {
  test.setTimeout(180_000);
  const origin = { Origin: APP_ORIGIN };

  // A session opened with the ORIGINAL password, kept alive across the reset
  // to prove the reset kills it.
  const preReset = await request.newContext();
  await test.step('mint a verified client, with one session already open', async () => {
    const reg = await preReset.post(`${API_NODE_BASE}/auth/register`, {
      headers: origin,
      data: {
        email: client.email,
        password: client.password,
        firstName: 'Reset',
        lastName: 'Journey',
      },
    });
    test.skip(reg.status() === 429, 'registration is rate limited right now (10/h)');
    expect(reg.ok(), `register answered ${reg.status()}`).toBe(true);
    const mail = await waitForMail(client.email, { subject: /verify/i });
    const token = new URL(linkIn(mail, APP_ORIGIN)).searchParams.get('token')!;
    expect(
      (
        await preReset.post(`${API_NODE_BASE}/auth/verify-email`, {
          headers: origin,
          data: { token },
        })
      ).ok(),
    ).toBe(true);
    const login = await preReset.post(`${API_NODE_BASE}/auth/login`, {
      headers: origin,
      data: { email: client.email, password: client.password },
    });
    test.skip(login.status() === 429, 'portal login is rate limited right now');
    expect(login.ok()).toBe(true);
    expect((await preReset.get(`${API_NODE_BASE}/auth/me`, { headers: origin })).ok()).toBe(true);
  });

  try {
    await test.step('ask for the link from the forgot-password screen', async () => {
      await page.goto('/auth/forgot-password');
      await page.getByPlaceholder('you@example.com').fill(client.email);
      const [res] = await Promise.all([
        page.waitForResponse((r) => isApi(r, '/auth/forgot-password', 'POST')),
        page.getByRole('button', { name: /send password reset link/i }).click(),
      ]);
      test.skip(res.status() === 429, 'forgot-password is rate limited right now (3/h)');
      expect(res.ok(), `forgot-password answered ${res.status()}`).toBe(true);
      await expect(page.getByText(/reset email sent/i)).toBeVisible();
    });

    await test.step('the emailed link sets a new password', async () => {
      const mail = await waitForMail(client.email, { subject: /reset|password/i });
      const link = linkIn(mail, APP_ORIGIN);
      resetToken = new URL(link).searchParams.get('token') ?? '';
      expect(resetToken, 'the reset mail carries no token').toBeTruthy();

      await page.goto(link);
      await expect(page.getByRole('heading', { name: /set new password/i })).toBeVisible();
      await page.locator('#newPassword').fill(client.password + '-NEW');
      await page.locator('#confirmPassword').fill(client.password + '-NEW');
      const [res] = await Promise.all([
        page.waitForResponse((r) => isApi(r, '/auth/reset-password', 'POST')),
        page.getByRole('button', { name: /update password/i }).click(),
      ]);
      expect(res.ok(), `reset-password answered ${res.status()}`).toBe(true);
      await expect(page.getByText(/password reset successful/i)).toBeVisible();
    });

    await test.step('old password dead, new one works, link spent, old session gone', async () => {
      const probe = await request.newContext();
      try {
        const oldLogin = await probe.post(`${API_NODE_BASE}/auth/login`, {
          headers: origin,
          data: { email: client.email, password: client.password },
        });
        expect(oldLogin.status(), 'the OLD password still signs in').toBe(401);

        const newLogin = await probe.post(`${API_NODE_BASE}/auth/login`, {
          headers: origin,
          data: { email: client.email, password: client.password + '-NEW' },
        });
        expect(newLogin.ok(), 'the NEW password does not sign in').toBe(true);

        // Single-use: replaying the spent token must change nothing.
        const replay = await probe.post(`${API_NODE_BASE}/auth/reset-password`, {
          headers: origin,
          data: { token: resetToken, password: 'Another-pass-123!' },
        });
        expect(replay.status(), 'the reset link is replayable').toBeGreaterThanOrEqual(400);

        // The session opened with the old credential is signed out everywhere:
        // its access token predates `passwordChangedAt`, so /auth/me refuses.
        const stale = await preReset.get(`${API_NODE_BASE}/auth/me`, { headers: origin });
        expect(stale.status(), 'a pre-reset session survived the reset').toBe(401);
      } finally {
        await probe.dispose();
      }
    });
  } finally {
    await preReset.dispose();
  }
});
