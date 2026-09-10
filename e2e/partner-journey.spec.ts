import { expect, test, type Page } from '@playwright/test';
import {
  adminApiSession,
  apiFromPage,
  isApi,
  requirePrecondition,
  signIn,
  waitForMail,
  linkIn,
  APP_ORIGIN,
} from './helpers';

/**
 * The partner programme, end to end — the one journey the suite did not cover,
 * and the one where every defect this feature shipped lived in a seam:
 *
 *  - the two-level ceiling (`chain_full`) is explained by GET /ib/status,
 *    enforced by POST /ib/apply, hides the sidebar entry, and bounces the
 *    typed URL — four surfaces that must agree;
 *  - an INTRODUCED applicant does not choose a programme: the panel shows the
 *    inherited agency as already selected and submits NO agencyId (the DTO
 *    once refused that exact shape with "agencyId must be a UUID");
 *  - approval nests the new partner beneath their introducer (the console
 *    once rooted every partner at level 1 via a `?? null` in the controller).
 *
 * Fixtures are seeded (see seed.ts): a two-rung chain `e2e-partner-l1@` /
 * `e2e-partner-l2@`, an applicant the admin always REJECTS so the apply flow
 * repeats forever, and `e2e-partner-fresh@` — approved once to prove the
 * nesting live, asserted as standing state on every run after.
 */

const APPLICANT = { email: 'e2e-partner-applicant@oxshare.com', password: 'client123' };
const FRESH = { email: 'e2e-partner-fresh@oxshare.com', password: 'client123' };
const L1_EMAIL = 'e2e-partner-l1@oxshare.com';
const DEEPEST_RUNG_CODE = 'E2EPARTL2';

// Every test here drives its own identity, never the shared cached session.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

/**
 * The admin index's id for a client, by email.
 *
 * `items`, NOT `rows` — the client index and the application queue disagree
 * about that key, and reading the wrong one returns undefined rather than
 * failing, which presented as "the fixture is not seeded" and skipped the
 * test it gates. Asserted rather than swallowed for the same reason.
 */
async function clientIdOf(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  email: string,
): Promise<string | undefined> {
  const res = await admin.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  expect(res.ok(), `the admin client index answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as { items?: { id: string; email: string }[] };
  return body.items?.find((r) => r.email === email)?.id;
}

/** Pending application ids for `email` — the queue nests them under `application`. */
async function pendingApplicationIds(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  email: string,
): Promise<string[]> {
  const res = await admin.get(
    `/admin/ib/applications?status=pending&q=${encodeURIComponent(email)}&limit=5`,
  );
  expect(res.ok(), `the admin application queue answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as { rows?: { application?: { id?: string } }[] };
  return (body.rows ?? [])
    .map((row) => row.application?.id)
    .filter((id): id is string => Boolean(id));
}

/** Reject any pending application for `email`, so the apply flow starts clean. */
async function rejectPendingApplication(
  admin: Awaited<ReturnType<typeof adminApiSession>>,
  email: string,
): Promise<void> {
  for (const id of await pendingApplicationIds(admin, email)) {
    const rejected = await admin.patch(`/admin/ib/applications/${id}/reject`, {
      note: 'E2E cleanup — this fixture must stay repeatable.',
    });
    // Asserted, not fired-and-forgotten: a swallowed refusal here surfaces
    // three assertions later as "the page still says under review".
    expect(rejected.ok(), `reject answered ${rejected.status()}`).toBe(true);
  }
}

/** Drive the apply panel: inherited card asserted, then submit. */
async function applyThroughInheritedPanel(page: Page): Promise<void> {
  /*
   * SETTLE FIRST. `/ib/status` decides which of five panels this screen is,
   * and clicking while that request is still in flight hits a button on a
   * render that is about to be replaced — the click lands on a detached node
   * and nothing happens, which presents as "Apply again does not work".
   */
  await page.waitForLoadState('networkidle');

  // A previous run may have left the REJECTED state — that is the loop
  // working, not a failure. "Apply again" re-opens the same panel; wait for
  // the SUBMIT button rather than asserting straight through, because the
  // rejected card and the apply panel are two renders and the assertions
  // below belong to the second.
  const reapply = page.getByRole('button', { name: /apply again/i });
  if (await reapply.isVisible().catch(() => false)) {
    await reapply.click();
  }
  await expect(page.getByRole('button', { name: /request to become a partner/i })).toBeVisible({
    timeout: 15_000,
  });

  /*
   * The inherited programme reads as CHOSEN — named, marked selected, with
   * nothing to fill in — and no agency radio list is offered: the choice is
   * not theirs, and a picker that must be ignored is worse than none.
   */
  await expect(page.getByText('E2E Agency', { exact: true })).toBeVisible();
  await expect(page.getByText(/selected for you automatically/i)).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);

  const [response] = await Promise.all([
    page.waitForResponse((res) => isApi(res, '/ib/apply', 'POST')),
    page.getByRole('button', { name: /request to become a partner/i }).click(),
  ]);
  /*
   * THE regression this journey exists to hold shut: an introduced applicant
   * submits no agencyId (the API derives it from the introducer), and the
   * request pipe once refused that shape with "agencyId must be a UUID"
   * before the rule that welcomes them could run.
   */
  expect(response.status(), 'the inherited (empty) apply shape must be accepted').toBeLessThan(300);
  await expect(page.getByText(/application is in review|we will email you/i).first()).toBeVisible();
}

test('a client under the deepest rung is locked out of the programme everywhere', async ({
  page,
}) => {
  test.setTimeout(180_000);

  /*
   * A FRESH registration under the level-2 partner's code, exactly as a real
   * introduction happens — the referral link. Unique per run, so re-runs
   * never collide with an identity that exists.
   */
  const client = {
    email: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@oxshare-e2e-partner.test`,
    password: 'e2e-password-123',
  };

  await page.goto(`/auth/register?ref=${DEEPEST_RUNG_CODE}`);
  // The form acknowledges the introduction before anything is typed.
  await expect(page.getByText(DEEPEST_RUNG_CODE)).toBeVisible();
  await page.getByPlaceholder('John').fill('Chain');
  await page.getByPlaceholder('Doe').fill('Full');
  await page.getByPlaceholder('you@example.com').fill(client.email);
  await page.locator('input[type="password"]').first().fill(client.password);
  const [registered] = await Promise.all([
    page.waitForResponse((res) => isApi(res, '/auth/register', 'POST')),
    page.getByRole('button', { name: /complete registration|create account/i }).click(),
  ]);
  requirePrecondition(
    registered.status() === 429,
    'registration is rate limited (10/hour per IP) — not the thing under test',
  );
  expect(registered.ok(), `registration answered ${registered.status()}`).toBe(true);

  // The address is proven the way a person proves it: through the mailbox.
  const mail = await waitForMail(client.email, { subject: /verify/i, timeoutMs: 20_000 });

  /*
   * WAIT FOR THE VERIFICATION TO LAND, not just for the page to render.
   *
   * `/auth/verify-email` performs the POST in a `useEffect`, so `goto` resolves
   * as soon as the document loads — BEFORE the request that actually verifies
   * the address. Signing in immediately afterwards raced it, and login answered
   * 403 EMAIL_NOT_VERIFIED, which is the API being exactly right: an unverified
   * address may not hold a session.
   *
   * The failure therefore read as "login is broken for introduced clients" when
   * nothing was broken at all, which is why the response is awaited and
   * asserted here rather than left to surface three steps later as somebody
   * else's status code. A verification that genuinely fails now says so, on the
   * line that did it.
   */
  const verifying = page.waitForResponse((res) => isApi(res, '/auth/verify-email', 'POST'), {
    timeout: 20_000,
  });
  await page.goto(linkIn(mail, APP_ORIGIN));
  const verified = await verifying;
  expect(
    verified.ok(),
    `verify-email answered ${verified.status()} — the address is not verified, so the ` +
      'sign-in below would fail with 403 EMAIL_NOT_VERIFIED for a reason that is not login',
  ).toBe(true);

  /*
   * SIGN IN, unconditionally. `POST /auth/register` sets no auth cookies —
   * it creates the account and sends the verification mail, nothing more — so
   * the browser is still anonymous here however the redirect looks. Probing
   * `page.url()` after a goto was the wrong question: the URL reads
   * /dashboard for the moment before the client-side guard bounces it, so the
   * fallback never fired and every later call answered 401.
   */
  await signIn(page, client);

  /*
   * The EXPLANATION: chain_full, and chain_full FIRST — this client has not
   * even started KYC, and "verify your identity" would send them through the
   * whole wizard to reach a door that stays shut.
   */
  const status = await apiFromPage(page, 'GET', '/ib/status');
  expect(status.status).toBe(200);
  expect((status.body as { eligible: boolean }).eligible).toBe(false);
  expect((status.body as { ineligibleCode: string }).ineligibleCode).toBe('chain_full');

  // The sidebar does not offer the door…
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /partner programme/i })).toHaveCount(0);

  // …the typed URL bounces…
  await page.goto('/partner');
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

  // …and the API refuses regardless of what the browser shows.
  const refused = await apiFromPage(page, 'POST', '/ib/apply', {});
  expect(refused.status).toBe(400);
  expect(String((refused.body as { message?: unknown })?.message)).toMatch(/deepest level/i);
});

test('an introduced applicant applies without choosing, and the panel says so', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // Start clean: a crashed earlier run may have left an application pending.
  const admin = await adminApiSession();
  try {
    await rejectPendingApplication(admin, APPLICANT.email);

    await signIn(page, APPLICANT);
    await page.goto('/partner');
    await applyThroughInheritedPanel(page);

    // The reviewer turns it down — which is the CLEANUP, not the assertion:
    // rejected → "Apply again" is what makes this journey repeatable forever.
    await rejectPendingApplication(admin, APPLICANT.email);
    await page.reload();
    await expect(page.getByText(/not approved/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /apply again/i })).toBeVisible();
  } finally {
    await admin.dispose();
  }
});

test('approval nests the recruited partner one rung beneath their introducer', async ({ page }) => {
  test.setTimeout(180_000);

  const admin = await adminApiSession();
  try {
    const freshId = await clientIdOf(admin, FRESH.email);
    const l1Id = await clientIdOf(admin, L1_EMAIL);
    requirePrecondition(!freshId || !l1Id, 'partner fixtures are not seeded — restart the API');

    /*
     * "Is this client already a partner?" answered by CONTENT, not status.
     * The detail route answers 200 with an EMPTY BODY for a client who holds
     * no partner account — not the 404 one would expect — so branching on the
     * status ran the standing-outcome path against nothing and died on
     * `.json()` of an empty string.
     */
    const detail = await admin.get(`/admin/ib/partners/${freshId}`);
    const detailBody = (await detail.text()).trim();
    if (!detailBody) {
      /*
       * Not a partner yet — the ONE run that proves the live path. Approval
       * is deliberately irreversible (there is no demote operation), so every
       * run after this one asserts the standing outcome below instead.
       */
      await rejectPendingApplication(admin, FRESH.email);
      await signIn(page, FRESH);
      await page.goto('/partner');
      await applyThroughInheritedPanel(page);

      const [submitted] = await pendingApplicationIds(admin, FRESH.email);
      expect(submitted, 'the submitted application is not in the admin queue').toBeTruthy();

      /*
       * The reviewer sends NO body — no parent named, no agency named — which
       * is exactly the console's ordinary approval, and exactly the shape
       * that was once coalesced into "root them at level 1".
       */
      const approved = await admin.patch(`/admin/ib/applications/${submitted}/approve`, {});
      expect(approved.ok(), `approve answered ${approved.status()}`).toBe(true);
      const account = (await approved.json()) as { level: number; parentIbUserId: string | null };
      expect(account.level).toBe(2);
      expect(account.parentIbUserId).toBe(l1Id);

      // The new partner's screen is the workspace now, referral code and all.
      await page.reload();
      await expect(page.getByText(/referral/i).first()).toBeVisible({ timeout: 15_000 });
    } else {
      // The standing outcome, re-asserted on every later run: still level 2,
      // still beneath the introducer — never re-rooted, never re-priced.
      expect(detail.ok(), `partner detail answered ${detail.status()}`).toBe(true);
      const body = JSON.parse(detailBody) as {
        level: number;
        parent: { userId: string } | null;
      };
      expect(body.level).toBe(2);
      expect(body.parent?.userId).toBe(l1Id);
    }
  } finally {
    await admin.dispose();
  }
});
