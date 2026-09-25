import { expect, test } from './fixtures';
import {
  TINY_PNG,
  apiFromPage,
  kycStepPath,
  openDocumentStep,
  openTypedDocumentStep,
  resetKycFixture,
  uploadKycFile,
} from './helpers';

/**
 * LEAVING AND COMING BACK — does the client have to start again?
 *
 * The reported doubt: "if I uploaded a document and exited KYC, when I come
 * back I have to upload it again." The server side plainly resumes — every step
 * is saved as it is completed and `/kyc/status` returns it — so if this is real
 * it is the portal failing to READ what it already holds, which is invisible
 * from the API and exactly what a browser test is for.
 *
 * There is a second reason this matters more than it looks. A client who
 * believes their document was lost uploads it again, and every re-upload is a
 * fresh copy of a passport in object storage.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

test.describe('coming back to an unfinished KYC', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      'resuming is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    await page.goto('/kyc');
    await resetKycFixture(page);
  });

  test('does not ask again for a document already uploaded', async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      'resuming is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    await openDocumentStep(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'passport.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    /*
     * CONFIRMED, not merely chosen. The uploader deliberately previews first and
     * uploads on confirm, so a test that only sets the file would prove nothing
     * about resuming — nothing would have been sent.
     *
     * WAITED FOR rather than probed with `isVisible()`. That returns false while
     * the preview is still rendering, so the click was skipped and the test then
     * waited out its timeout on an upload that had never started — which is a
     * test that fails for its own reasons and teaches nothing about the product.
     */
    const confirm = page.getByRole('button', { name: /use this|confirm/i }).first();
    await expect(confirm, 'the preview never appeared').toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await expect(
      page.getByRole('button', { name: /^replace$/i }).first(),
      'the upload never completed, so this cannot test resuming',
    ).toBeVisible({ timeout: 20_000 });

    // LEAVE. Away from the flow entirely, then a hard load back into it — the
    // closest a test gets to closing the tab and returning later.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.goto(await kycStepPath(page, 'document'));
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /^replace$/i }).first(),
      'the client was asked to upload a document the server already holds',
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      page.locator('input[type="file"]').first(),
      'an empty file picker is what "upload it again" looks like',
    ).toBeHidden();
  });

  test('keeps the personal details already typed in', async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      'resuming is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    // Wherever the broker has put it — the builder may reorder the steps.
    const personalStep = await kycStepPath(page, 'personal');
    await page.goto(personalStep);
    await page.waitForLoadState('networkidle');

    const first = page.getByLabel(/first name/i).first();
    await first.fill('Resumed');
    // The PHONE too: every other field came back while this one did not —
    // it read its value once at mount, before the saved answers arrived.
    await page
      .getByLabel(/phone number/i)
      .first()
      .fill('70 777 777');
    await page
      .getByRole('button', { name: /continue|next/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.goto(personalStep);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByLabel(/first name/i).first(),
      'a returning client had to retype their own name',
    ).toHaveValue('Resumed');
    await expect(
      page.getByLabel(/phone number/i).first(),
      'a returning client found their phone number gone',
    ).toHaveValue('70 777 777');
  });

  test('a CLEARED phone number is saved — leaving without Continue does not bring the old one back', async ({
    page,
    isMobile,
  }) => {
    /*
     * Reported from local testing: go back to the profile, clear the phone,
     * leave KYC. Answers reached the server only on Continue, so the server
     * kept the old number, the wizard resumed past the profile, and the screen
     * showed the cleared phone — shown and saved had come apart. Typed steps
     * now save as the client types (`use-step-autosave.ts`).
     */
    test.skip(
      isMobile,
      'resuming is LOGIC, not layout — and each case spends the 10-uploads-a-minute budget the whole suite shares',
    );
    const personalStep = await kycStepPath(page, 'personal');

    const saved = await apiFromPage(page, 'POST', '/kyc/step', {
      step: 'personal',
      data: { firstName: 'Kept', lastName: 'Number', phone: '+961 70 777 777' },
    });
    expect(saved.status).toBeLessThan(300);

    await page.goto(personalStep);
    await page.waitForLoadState('networkidle');
    const phone = page.getByLabel(/phone number/i).first();
    await expect(phone).toHaveValue('70 777 777');

    await phone.fill('');
    await expect(page.getByText(/all changes saved/i)).toBeVisible({ timeout: 10_000 });

    // Leave WITHOUT Continue, then come back.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const status = await apiFromPage(page, 'GET', '/kyc/status');
    expect(
      (status.body as { personalInfo?: { phone?: string } }).personalInfo?.phone,
      'the server kept the number the client cleared',
    ).toBe('');

    await page.goto(personalStep);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/phone number/i).first(), 'the old number came back').toHaveValue(
      '',
    );
  });

  test('remembers WHICH document the client chose, not just that a file arrived', async ({
    page,
  }) => {
    /*
     * The trap this pins. `POST /kyc/upload` writes
     * `docType: submission.document?.docType ?? 'passport'` — so a client who
     * picks National ID and uploads its first page BEFORE pressing Continue has
     * `passport` recorded as their document type, because Continue is what saves
     * the choice.
     *
     * On return the picker re-selects from the STORED type, so they would land on
     * Passport with their National ID progress apparently gone — and National ID
     * takes two photos, so this is the case where a client is most likely to
     * upload one, stop, and come back later.
     */
    await openTypedDocumentStep(page, 'document', /national id/i);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'id-front.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    const confirm = page.getByRole('button', { name: /use this|confirm/i }).first();
    await expect(confirm, 'the preview never appeared').toBeVisible({ timeout: 15_000 });
    await confirm.click();
    await expect(page.getByRole('button', { name: /^replace$/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Leave WITHOUT pressing Continue — the step is half done, which is the
    // whole point: Continue is what saves the chosen type.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.goto(await kycStepPath(page, 'document'));
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('button', { name: /national id/i }).first(),
      'the client came back to a different document type than the one they chose',
    ).toHaveAttribute('class', /border-ring|bg-primary/);
  });

  test('the document ON FILE wins over a card clicked and never uploaded', async ({ page }) => {
    /*
     * Reported from local testing: a national ID was on file, the Passport card
     * was clicked and nothing uploaded, and coming back the review screen said
     * "Passport — Missing" while the server held a complete national ID. This
     * tab's draft had kept the click. A step now OPENS on the document on file;
     * a click made after that still wins.
     */
    for (const slot of ['doc_front', 'doc_back']) {
      expect(await uploadKycFile(page, slot, 'national_id'), `${slot} was not stored`).toBeLessThan(
        400,
      );
    }
    const selected = /border-ring|bg-primary/;
    const documentStep = await kycStepPath(page, 'document');
    await page.goto(documentStep);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /national id/i }).first()).toHaveAttribute(
      'class',
      selected,
    );

    // The stray click — Passport, nothing uploaded — and away.
    const passport = page.getByRole('button', { name: /passport/i }).first();
    await passport.click();
    await expect(
      passport,
      'the click itself must still win while the step is open',
    ).toHaveAttribute('class', selected);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const config = await apiFromPage(page, 'GET', '/kyc/config');
    const title =
      (config.body as { slug: string; title: string }[]).find((step) => step.slug === 'document')
        ?.title ?? '';
    await page.goto(await kycStepPath(page, 'review'));
    await page.waitForLoadState('networkidle');
    const identity = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(identity, 'the review lost the national ID on file').toContainText(/national id/i);
    await expect(identity, 'the review listed a document never uploaded').not.toContainText(
      /passport|missing/i,
    );

    await page.goto(documentStep);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('button', { name: /national id/i }).first(),
      'the step reopened on a card with nothing uploaded',
    ).toHaveAttribute('class', selected);
  });
});
