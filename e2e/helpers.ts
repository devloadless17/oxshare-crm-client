import type { Page, Response } from '@playwright/test';
// The app's own cookie names, not a second copy of them. `client.ts` explains
// why they are worth importing rather than retyping: the backend computes these
// and this repo hardcodes them, with nothing connecting the two.
import { CSRF_COOKIE_NAMES } from '../src/lib/api/client';

/**
 * The client the E2E SUITE owns — seeded verified and KYC-approved.
 *
 * Deliberately NOT `client@oxshare.com`. The suite used that one, which is the
 * account a developer is usually signed in as while working, and it caused two
 * real problems within a single run: repeated test logins exhausted the
 * 5-per-minute login limit and answered a developer's own sign-in with 429, and
 * two parties rotating refresh tokens for one identity is precisely what reuse
 * detection exists to punish.
 *
 * A test fixture must not share an identity with a person.
 */
export const E2E_CLIENT = {
  email: 'e2e@oxshare.com',
  password: 'client123',
} as const;

/**
 * A VERIFIED client with no KYC submission — the one the wizard spec drives.
 *
 * Separate from `E2E_CLIENT`, which is already approved and so has no wizard
 * left to walk. This one deliberately never submits, staying `in_progress`,
 * which is what makes the spec repeatable.
 */
export const E2E_KYC_CLIENT = {
  email: 'e2e-kyc@oxshare.com',
  password: 'client123',
} as const;

/**
 * The client whose only job is to be SIGNED OUT.
 *
 * `logout` revokes every family for a user, not just the session presenting a
 * token (R-3.3 — signing out on one device must not leave the others live). So
 * a spec that drives a real sign-out on `E2E_CLIENT` destroys the session every
 * later spec replays from `STORAGE_STATE`, and the run reports one logout
 * failure followed by a dozen unrelated-looking auth failures.
 *
 * That is why the logout spec sat `fixme`d. It has its own identity now, and
 * nothing else may sign in as this one.
 */
export const E2E_LOGOUT_CLIENT = {
  email: 'e2e-logout@oxshare.com',
  password: 'client123',
} as const;

/** Where each signed-in session is cached between specs. See `auth.setup.ts`. */
export const STORAGE_STATE = 'e2e/.auth/client.json';
export const KYC_STORAGE_STATE = 'e2e/.auth/kyc-client.json';

/**
 * A real 1x1 PNG, as bytes.
 *
 * Real rather than `Buffer.from('x')` because the upload path checks the file's
 * leading bytes against its declared type (`file-signature.ts`) and refuses
 * anything that is not genuinely the format it claims. A fake would be rejected
 * by the server, and the spec would be testing the rejection path by accident.
 */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Sign in through the real form.
 *
 * Used ONCE per run by `auth.setup.ts`, not per test — the session is then
 * reused from `STORAGE_STATE`. Driving the form is the only way these specs
 * exercise login at all, but doing it per spec is what burned the rate limit.
 *
 * Not by planting a cookie: the session is httpOnly and the login response
 * carries no token, so there is nothing to plant.
 */
export async function signIn(
  page: Page,
  credentials: { email: string; password: string } = E2E_CLIENT,
): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);

  /*
   * Watch the login response, not just the URL.
   *
   * `POST /auth/login` is capped at five per minute, which is correct and which
   * a suite that signs in more than once WILL hit — especially while someone is
   * iterating on a spec and re-running it. Waiting only on the URL turns that
   * into a bare "Timeout 30000ms exceeded", which reads as "login is broken" and
   * sends whoever sees it looking in the wrong place. It cost real time once
   * already.
   *
   * So the status is captured and reported. A 429 is a fact about the harness,
   * not about the product, and the message says so.
   */
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);

  if (response.status() === 429) {
    throw new Error(
      `Rate limited signing in as ${credentials.email}: POST /auth/login answered 429. ` +
        'The cap is five per minute and it is not the thing under test — wait a minute and ' +
        're-run, or reduce how many times this suite signs in.',
    );
  }
  if (!response.ok()) {
    throw new Error(
      `Could not sign in as ${credentials.email}: POST /auth/login answered ${response.status()}.`,
    );
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Register a brand-new client through the real form.
 *
 * Shares `signIn`'s reason for existing: registration is capped at TEN PER HOUR
 * per IP — a far tighter budget than login's five per minute, and one a suite
 * that registers on every run WILL exhaust after a few iterations. Waiting only
 * on the URL turns that into a bare 30-second timeout that reads as "the
 * registration flow is broken", and the honest answer is "you have registered
 * ten people this hour".
 *
 * The cap is right and should not be relaxed for tests. What the tests owe is to
 * say which one they hit.
 */
export async function register(
  page: Page,
  client: { email: string; password: string },
): Promise<void> {
  await page.goto('/auth/register');
  await page.getByPlaceholder('John').fill('Kaya');
  await page.getByPlaceholder('Doe').fill('Newman');
  await page.getByPlaceholder('you@example.com').fill(client.email);
  await page.locator('input[type="password"]').first().fill(client.password);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/auth/register') && res.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: /complete registration|create account/i }).click(),
  ]);

  if (response.status() === 429) {
    throw new Error(
      'Rate limited registering: POST /auth/register answered 429. The cap is ten per hour ' +
        'per IP and it is not the thing under test — wait, or run this spec less often.',
    );
  }
  if (!response.ok()) {
    throw new Error(`Registration answered ${response.status()} for ${client.email}.`);
  }
}

/**
 * Put the KYC fixture back to an empty submission.
 *
 * WHY THIS IS NEEDED. `e2e-kyc@oxshare.com` is seeded with no submission, which
 * makes the FIRST run of the wizard spec repeatable and every run after it a
 * different world: the specs upload a document, the row keeps it, and the next
 * run finds an uploader already showing its "uploaded" state — so the
 * preview-before-upload flow it exists to assert never renders. The status
 * stayed `not_started` while `document` quietly became non-null, which is why
 * the failure looked like a product regression rather than accumulated state.
 *
 * Seeding cannot fix it: seeds run at boot, and the dev server people actually
 * run these against stays up for days. The fixture has to reset itself.
 *
 * Driven through `POST /kyc/reset`, the real endpoint, from inside the page so
 * it carries the real session cookies — and the CSRF header, because the API
 * refuses a state-changing request without it. That header is the one thing the
 * app is allowed to read from JS (it is proof of same-origin, not a
 * credential), which is exactly why this can be done from here at all.
 *
 * Safe by construction: `resetKyc` refuses when a submission is approved or
 * under review, so this can never destroy the approved fixture even if pointed
 * at the wrong session.
 */
export async function resetKycFixture(page: Page): Promise<void> {
  const status = await page.evaluate(async (cookieNames) => {
    const jar = document.cookie.split('; ');
    const raw = cookieNames
      .map((name) => jar.find((c) => c.startsWith(`${name}=`)))
      .find((found) => found !== undefined);
    if (raw === undefined) return 0;

    const res = await fetch('/api/kyc/reset', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-oxshare-csrf': decodeURIComponent(raw.slice(raw.indexOf('=') + 1)) },
    });
    return res.status;
  }, CSRF_COOKIE_NAMES);

  if (status === 0) throw new Error('No CSRF cookie — is this page signed in?');
  // 200 is a reset; 400 means there was nothing to reset, which is the same
  // world as far as the wizard is concerned. Anything else is worth failing on
  // rather than discovering three assertions later.
  if (status !== 200 && status !== 201 && status !== 400) {
    throw new Error(`POST /kyc/reset answered ${status}; the wizard fixture is not clean.`);
  }
}

/**
 * Every API response the page received that the server refused.
 *
 * The reason to reach for a browser at all: a unit test cannot see that a layout
 * fires a request on every navigation. Collecting responses lets a spec assert
 * about the traffic the UI produced without knowing which component produced
 * it — exactly the shape of the 403 flood that a passing unit suite missed.
 *
 * Only API calls count. A 404 for a favicon or a dev-server asset is noise from
 * the environment, not something the app decided to do.
 */
export function collectRejections(page: Page): { list: () => string[] } {
  const rejected: string[] = [];

  page.on('response', (response: Response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const status = response.status();
    if (status === 401 || status === 403) {
      rejected.push(`${status} ${new URL(url).pathname}`);
    }
  });

  return { list: () => [...rejected] };
}

/**
 * A fresh, definitely-unverified account.
 *
 * Unique per run so a re-run never collides: registration answers identically
 * whether or not the address exists (deliberately — it is a membership oracle
 * otherwise), so a collision would fail confusingly rather than loudly.
 */
export function newClient(): { email: string; password: string } {
  return {
    email: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@oxshare-e2e.test`,
    password: 'e2e-password-123',
  };
}
