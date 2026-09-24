import { expect, test } from './fixtures';
import {
  TINY_PNG,
  adminApiSession,
  apiFromPage,
  kycStepPath,
  resetKycFixture,
  uploadKycFile,
} from './helpers';

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
 *
 * An added step holds typed answers and FILE fields — never a catalogue
 * document, which the server now refuses outside the two document steps
 * (`assertFieldsFitTheirStep`). So the step below is what a broker can build:
 * a required answer and a required upload, each of which must stop Continue.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

const SLUG = 'e2e-portal-extra';
const TEXT_FIELD = 'customField_portal_text';
const FILE_FIELD = 'customField_portal_file';
/** "Tick all that apply" — a checkbox with choices (asked for in local testing). */
const GROUP_FIELD = 'customField_portal_group';

const ANSWER = 'Salary from employment';

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
       * REQUIRED — reported from local testing: a required upload that let the
       * client continue without it. On a built-in step that could not work (the
       * step had nowhere to keep it, and the builder no longer offers it); on a
       * step the broker adds it must, and this is where that is proved.
       */
      { id: 'f-file', name: FILE_FIELD, label: 'Proof of Income', type: 'file', required: true },
      {
        id: 'f-group',
        name: GROUP_FIELD,
        label: 'Income sources',
        type: 'checkbox',
        required: true,
        options: ['Salary', 'Savings', 'Gift'],
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
  test('refuses Continue until every required answer, upload and choice is there, then keeps them all', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'custom-step plumbing is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    await page.goto('/kyc');
    await resetKycFixture(page);

    await page.goto(await kycStepPath(page, SLUG));
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Extra Checks').first()).toBeVisible({ timeout: 15_000 });
    const next = page.getByRole('button', { name: /^continue$/i });

    // ── Nothing yet: the typed answer is asked for first ──────────────────
    await next.click();
    await expect(
      page.getByRole('alert').filter({ hasText: /please fill in: source of funds/i }),
      'Continue accepted an empty required answer',
    ).toBeVisible({ timeout: 10_000 });

    // ── Answered, no file: the UPLOAD is asked for ─────────────────────────
    await page
      .getByLabel(/source of funds/i)
      .first()
      .fill(ANSWER);
    await next.click();
    await expect(
      page.getByRole('alert').filter({ hasText: /please upload: proof of income/i }),
      'Continue accepted a step without its required upload',
    ).toBeVisible({ timeout: 10_000 });

    // ── Uploaded: the step advances, and both answers are on the server ────
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'income.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    const confirm = page.getByRole('button', { name: /use this|confirm/i }).first();
    await expect(confirm, 'the preview never appeared').toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await expect(page.getByRole('button', { name: /^replace$/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // ── Uploaded, nothing ticked: the required GROUP is asked for ─────────────
    await next.click();
    await expect(
      page.getByRole('alert').filter({ hasText: /please fill in: income sources/i }),
      'Continue accepted a required "tick all that apply" with nothing ticked',
    ).toBeVisible({ timeout: 10_000 });
    const sources = page.getByRole('group', { name: /income sources/i });
    await sources.getByRole('checkbox', { name: 'Savings' }).check();
    await sources.getByRole('checkbox', { name: 'Salary' }).check();

    /*
     * WAIT FOR THE SAVE ITSELF, not for the network to go quiet: `networkidle`
     * can settle before the step POST is answered, and the status read below
     * then races the write — how this case once flaked on mobile only.
     */
    const saved = page.waitForResponse(
      (res) => res.url().includes('/kyc/step') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    const here = page.url();
    await next.click();
    expect((await saved).status(), 'the step save was refused').toBeLessThan(400);
    await expect(page, 'the step did not advance').not.toHaveURL(here, { timeout: 15_000 });

    const { body } = await apiFromPage(page, 'GET', '/kyc/status');
    const answers =
      (body as { stepData?: Record<string, Record<string, unknown>> }).stepData?.[SLUG] ?? {};
    expect(
      answers[TEXT_FIELD],
      'the answer was discarded on Continue — the step took input and threw it away',
    ).toBe(ANSWER);
    expect(
      (answers[FILE_FIELD] as { filePath?: string } | undefined)?.filePath,
      'the upload is not on the server',
    ).toBeTruthy();
    // Ticked Savings then Salary; kept in the order the broker listed them.
    expect(answers[GROUP_FIELD]).toBe('Salary, Savings');
  });

  test("a file on a custom step does not overwrite the client's passport", async ({
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
      await uploadKycFile(page, 'doc_front', 'passport'),
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

    // Now upload into the CUSTOM step's file field.
    await page.goto(await kycStepPath(page, SLUG));
    await page.waitForLoadState('networkidle');
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
