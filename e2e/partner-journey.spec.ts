import { expect, test, type Page } from '@playwright/test';
import { adminApiSession, isApi, requirePrecondition, signIn } from './helpers';

/**
 * The partner programme, end to end — the journey where every defect this
 * feature shipped lived in a seam:
 *
 *  - an applicant introduced by a partner CHOOSES their programme like anyone
 *    else, because every new partner is a main partner (13 Oct 2026);
 *  - approval with no parent named makes them a MAIN partner (level 1), never
 *    a sub-partner of their introducer. Level 2 is an administrator's act.
 *
 * Fixtures are seeded (see seed.ts): `e2e-partner-l1@` (the introducer), an
 * applicant the admin always REJECTS so the apply flow repeats forever, and
 * `e2e-partner-main@` — approved once to prove the outcome live, asserted as
 * standing state on every run after.
 */

const APPLICANT = { email: 'e2e-partner-applicant@oxshare.com', password: 'client123' };
const MAIN = { email: 'e2e-partner-main@oxshare.com', password: 'client123' };
const AGENCY = 'E2E Agency';

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
): Promise<number | undefined> {
  const res = await admin.get(`/admin/clients?q=${encodeURIComponent(email)}&limit=5`);
  expect(res.ok(), `the admin client index answered ${res.status()}`).toBe(true);
  const body = (await res.json()) as { items?: { id: number; email: string }[] };
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

/** Drive the apply panel: choose the programme, then submit. */
async function applyChoosingProgramme(page: Page): Promise<void> {
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
  const submit = page.getByRole('button', { name: /request to become a partner/i });
  await expect(submit).toBeVisible({ timeout: 15_000 });

  // Introduced or not, the applicant picks: nothing is chosen for them.
  await expect(submit).toBeDisabled();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(AGENCY) }).click();

  const [response] = await Promise.all([
    page.waitForResponse((res) => isApi(res, '/ib/apply', 'POST')),
    submit.click(),
  ]);
  expect(response.status(), `apply answered ${response.status()}`).toBeLessThan(300);
  await expect(page.getByText(/application is in review|we will email you/i).first()).toBeVisible();
}

test('an introduced applicant chooses their programme and applies', async ({ page }) => {
  test.setTimeout(180_000);

  // Start clean: a crashed earlier run may have left an application pending.
  const admin = await adminApiSession();
  try {
    await rejectPendingApplication(admin, APPLICANT.email);

    await signIn(page, APPLICANT);
    await page.goto('/partner');
    await applyChoosingProgramme(page);

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

test('approval makes an introduced applicant a main partner, not their introducer’s sub-partner', async ({
  page,
}) => {
  test.setTimeout(180_000);

  const admin = await adminApiSession();
  try {
    const mainId = await clientIdOf(admin, MAIN.email);
    requirePrecondition(!mainId, 'partner fixtures are not seeded — restart the API');

    /*
     * "Is this client already a partner?" answered by CONTENT, not status.
     * The detail route answers 200 with an EMPTY BODY for a client who holds
     * no partner account — not the 404 one would expect — so branching on the
     * status ran the standing-outcome path against nothing and died on
     * `.json()` of an empty string.
     */
    const detail = await admin.get(`/admin/ib/partners/${mainId}`);
    const detailBody = (await detail.text()).trim();
    if (!detailBody) {
      /*
       * Not a partner yet — the ONE run that proves the live path. Approval
       * is deliberately irreversible (there is no demote operation), so every
       * run after this one asserts the standing outcome below instead.
       */
      await rejectPendingApplication(admin, MAIN.email);
      await signIn(page, MAIN);
      await page.goto('/partner');
      await applyChoosingProgramme(page);

      const [submitted] = await pendingApplicationIds(admin, MAIN.email);
      expect(submitted, 'the submitted application is not in the admin queue').toBeTruthy();

      // The console's ordinary approval: no parent named.
      const approved = await admin.patch(`/admin/ib/applications/${submitted}/approve`, {});
      expect(approved.ok(), `approve answered ${approved.status()}`).toBe(true);
      const account = (await approved.json()) as { level: number; parentIbUserId: number | null };
      expect(account.level).toBe(1);
      expect(account.parentIbUserId).toBeNull();

      // The new partner's screen is the workspace now, referral code and all.
      await page.reload();
      await expect(page.getByText(/referral/i).first()).toBeVisible({ timeout: 15_000 });
    } else {
      // The standing outcome, re-asserted on every later run.
      expect(detail.ok(), `partner detail answered ${detail.status()}`).toBe(true);
      const body = JSON.parse(detailBody) as {
        level: number;
        parent: { userId: number } | null;
      };
      expect(body.level).toBe(1);
      expect(body.parent).toBeNull();
    }
  } finally {
    await admin.dispose();
  }
});
