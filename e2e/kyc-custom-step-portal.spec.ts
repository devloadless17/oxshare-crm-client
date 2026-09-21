import { expect, test } from './fixtures';
import {
  API_BASE,
  TINY_PNG,
  adminApiSession,
  apiFromPage,
  csrfOf,
  resetKycFixture,
} from './helpers';
import type { Page } from '@playwright/test';

/**
 * A step the BROKER added, driven through the CLIENT's wizard.
 *
 * Three defects reported from production all lived on this path, and all three
 * were invisible to the API tests that covered it:
 *
 *  - the wizard branched on the five canonical slugs, so a custom step was never
 *    validated and its answers were never sent at all — typed in, then thrown
 *    away on Continue;
 *  - a Live Camera field uploaded as `selfie`, replacing the client's identity
 *    selfie with whatever the custom step asked for;
 *  - a document field mapped onto `doc_front`, overwriting their passport.
 *
 * Each one is a decision the BROWSER makes about where to send a file, so only a
 * browser can catch it. The admin suite drives this feature over the API, which
 * is exactly why it stayed green while all three were broken.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

const SLUG = 'e2e-portal-extra';
const TEXT_FIELD = 'customField_portal_text';
const FILE_FIELD = 'customField_portal_file';
const ANSWER = 'Salary from employment';

/**
 * Upload a file as the signed-in client, from inside the page.
 *
 * The selfie step is a live CAMERA, not a file picker, so `setInputFiles` has
 * nothing to attach to — and the first version of this spec quietly skipped its
 * own assertion because of it, which is the failure mode this suite is most
 * careful about: a skipped Playwright test reports as passing.
 *
 * Posting the multipart form from the browser uses the client's real session and
 * real CSRF token, so it exercises the same route the UI does without needing a
 * fake camera device.
 */
async function uploadAs(page: Page, field: string, fileName: string): Promise<number> {
  const status = await postUpload(page, field, fileName);
  if (status !== 429) return status;
  /*
   * WAITED OUT, never weakened — the same choice every other helper here makes.
   * Uploads are capped at ten a minute PER IP and the whole suite shares that
   * budget, so a spec that adds uploads can starve the one running after it.
   * Raising a real rate limit so a test suite fits inside it would remove the
   * protection from production to make CI green.
   */
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  return postUpload(page, field, fileName);
}

async function postUpload(page: Page, field: string, fileName: string): Promise<number> {
  const csrf = await csrfOf(page.context());
  return page.evaluate(
    async ({ base, field, fileName, csrf, bytes }) => {
      const body = new FormData();
      body.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), fileName);
      body.append('field', field);
      const res = await fetch(`${base}/kyc/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-oxshare-csrf': csrf },
        body,
      });
      return res.status;
    },
    { base: API_BASE, field, fileName, csrf, bytes: Array.from(TINY_PNG) },
  );
}

let createdStepId: string | undefined;

/*
 * ONE admin session for the whole file, not one per hook.
 *
 * Admin sign-in is capped at five a minute, and `adminApiSession` WAITS OUT a
 * 429 rather than weakening the limit — so a session per beforeEach/afterEach
 * was four logins for two tests, and the wait blew the 60s hook timeout. The
 * step is configuration the tests only read, so it is created once.
 */
let admin: Awaited<ReturnType<typeof adminApiSession>> | undefined;

test.beforeAll(async () => {
  admin = await adminApiSession();

  /*
   * SWEEP FIRST. A run interrupted between `beforeAll` and `afterAll` — a
   * ctrl-C, a crashed worker, a `--grep` that aborted — leaves this step in the
   * live configuration, and it is a REQUIRED step, so every client's wizard
   * grows one nobody meant to add. The next run then fails on a duplicate slug
   * and leaves two.
   *
   * Cleaning up after the LAST run rather than trusting it is what makes this
   * spec safe to interrupt.
   */
  const existing = await admin.get('/admin/kyc-config');
  if (existing.ok()) {
    const body: unknown = await existing.json();
    const steps = (Array.isArray(body) ? body : (body as { steps: unknown[] }).steps) as {
      id: string;
      slug: string;
    }[];
    for (const stale of steps.filter((step) => step.slug === SLUG)) {
      await admin.del(`/admin/kyc-config/steps/${stale.id}`);
    }
  }

  const res = await admin.post('/admin/kyc-config/steps', {
    slug: SLUG,
    title: 'Extra Checks',
    enabled: true,
    fields: [
      { id: 'f-txt', name: TEXT_FIELD, label: 'Source of Funds', type: 'text', required: true },
      /*
       * A DOCUMENT field (`doc:*`), not a plain `file`. That distinction is the
       * whole point of the second case: a plain file field already uploaded
       * under its own name and was never broken, while a document field was
       * translated onto `doc_front` — the canonical column — and so landed on
       * top of the client's passport. Testing the `file` type here would have
       * passed before the fix and proved nothing.
       */
      {
        id: 'f-doc',
        name: FILE_FIELD,
        label: 'Proof of Income',
        type: 'doc:passport',
        required: false,
      },
    ],
  });
  expect(res.status(), 'could not configure the custom step').toBeLessThan(400);
  createdStepId = ((await res.json()) as { id: string }).id;
});

test.afterAll(async () => {
  try {
    if (createdStepId && admin) {
      /*
       * DELETED by id, never a whole-config replace: `PUT /admin/kyc-config` is a
       * delete-then-insert, so a restore that fails midway leaves every client
       * with no onboarding at all. A failed cleanup here leaves one extra step.
       */
      const res = await admin.del(`/admin/kyc-config/steps/${createdStepId}`);
      expect(res.status(), `the test step ${createdStepId} is still in the live flow`).toBeLessThan(
        400,
      );
      createdStepId = undefined;
    }
  } finally {
    await admin?.dispose();
  }
});

test.describe('a broker-added step, in the client wizard', () => {
  test('saves what the client types, and refuses Continue while it is empty', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'custom-step plumbing is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    await page.goto('/kyc');
    await resetKycFixture(page);

    // The custom step is appended, so it sits after the four seeded ones.
    await page.goto('/kyc/step/5');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Extra Checks').first()).toBeVisible({ timeout: 15_000 });

    // ── REQUIRED is enforced before the step will advance ──────────────────
    await page
      .getByRole('button', { name: /continue|next/i })
      .first()
      .click();
    await expect(
      page.getByText(/required|fill/i).first(),
      'Continue accepted an empty required field',
    ).toBeVisible({ timeout: 10_000 });

    // ── What is typed is SAVED ─────────────────────────────────────────────
    await page
      .getByLabel(/source of funds/i)
      .first()
      .fill(ANSWER);
    /*
     * WAIT FOR THE SAVE ITSELF, not for the network to go quiet.
     *
     * `networkidle` after Continue is a guess about timing: it can settle before
     * the step POST has been answered, and the status read below then races the
     * write. That is exactly how this case failed on the mobile project while
     * passing on desktop — a difference in speed, not in behaviour, and a flake
     * that would have read as a mobile bug. Waiting on the request makes the
     * assertion mean what it says on both.
     */
    const saved = page.waitForResponse(
      (res) => res.url().includes('/kyc/step') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page
      .getByRole('button', { name: /continue|next/i })
      .first()
      .click();
    expect((await saved).status(), 'the step save was refused').toBeLessThan(400);

    const { body } = await apiFromPage(page, 'GET', '/kyc/status');
    const stepData =
      (body as { stepData?: Record<string, Record<string, unknown>> }).stepData ?? {};
    expect(
      stepData[SLUG]?.[TEXT_FIELD],
      'the answer was discarded on Continue — the step took input and threw it away',
    ).toBe(ANSWER);
  });

  test("a DOCUMENT on a custom step does not overwrite the client's passport", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'custom-step plumbing is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    await page.goto('/kyc');
    await resetKycFixture(page);

    // A real passport on the canonical document step — the file the bug destroyed.
    expect(
      await uploadAs(page, 'doc_front', 'passport.png'),
      'the passport upload failed',
    ).toBeLessThan(400);

    const before = await apiFromPage(page, 'GET', '/kyc/status');
    const passportBefore = (before.body as { document?: { frontFilePath?: string } }).document
      ?.frontFilePath;
    /*
     * ASSERTED, never skipped. Skipping would make this case pass on a run where
     * the passport never uploaded — a green test proving nothing about the one
     * file the bug destroyed.
     */
    expect(
      passportBefore,
      'no passport on file, so an overwrite could not be detected',
    ).toBeTruthy();

    // Now upload into the CUSTOM step's document field.
    await page.goto('/kyc/step/5');
    await page.waitForLoadState('networkidle');
    const card = page.getByRole('button', { name: /proof of income|passport/i }).first();
    if (await card.isVisible().catch(() => false)) await card.click();
    const picker = page.locator('input[type="file"]').first();
    await expect(picker, 'the custom step offered no uploader').toBeAttached({ timeout: 15_000 });
    await picker.setInputFiles({ name: 'income.png', mimeType: 'image/png', buffer: TINY_PNG });
    const confirm = page.getByRole('button', { name: /use this|confirm/i }).first();
    await expect(confirm, 'the preview never appeared').toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await expect(page.getByRole('button', { name: /^replace$/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    const after = await apiFromPage(page, 'GET', '/kyc/status');
    const body = after.body as {
      document?: { frontFilePath?: string };
      stepData?: Record<string, Record<string, { filePath?: string }>>;
    };

    expect(
      body.document?.frontFilePath,
      "the custom step's document replaced the client's passport — the reviewer would check a file the client never submitted as their ID",
    ).toBe(passportBefore);
    expect(
      body.stepData?.[SLUG]?.[FILE_FIELD]?.filePath,
      'the custom step kept no file of its own',
    ).toBeTruthy();
  });
});
