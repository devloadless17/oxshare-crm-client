import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TINY_PNG, openDocumentStep, resetKycFixture } from './helpers';

/**
 * KYC onboarding, on the device it is actually used from.
 *
 * The KYC review found the mobile-capture gaps to be the largest group of real
 * defects, and no unit test could reach most of them: `capture` attributes,
 * whether a photo is previewed before it is sent, and — the one that matters
 * most — the canvas normalisation that rotates a photo upright, strips its GPS
 * metadata and brings a 12 MB camera original under the upload limit.
 *
 * That canvas path had NEVER been executed. jsdom has no image decoding, so its
 * unit tests deliberately cover only the pure arithmetic and the failure
 * behaviour. This is the first thing that runs it for real, end to end, against
 * the actual upload endpoint.
 *
 * Runs as `e2e-kyc@oxshare.com`: verified, but never submitted. It stops short
 * of submitting on purpose — that leaves the fixture `in_progress`, which
 * `saveStep` accepts indefinitely, so the spec is repeatable. The submit
 * contract itself is proven server-side in `test/kyc-http.spec.ts`.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

/**
 * Put the document uploader back to its empty state.
 *
 * These specs share one fixture and one KYC row, so an earlier spec that
 * uploaded leaves the tile showing "Replace" rather than the two capture
 * buttons — and the next spec then fails on run two while passing on run one.
 * Order-dependence is exactly the flakiness worth refusing, so each spec puts
 * the uploader where it expects to find it rather than hoping.
 */
async function resetUploader(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  const replace = page.getByRole('button', { name: /^replace$/i }).first();
  if (await replace.isVisible().catch(() => false)) {
    await replace.click();
    // Wait for the empty state to actually render. Clicking and continuing
    // immediately raced the re-render, so the next assertion looked for the
    // capture buttons while the tile was still showing the uploaded state.
    await expect(page.getByRole('button', { name: /take photo/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

test.describe('the KYC wizard', () => {
  /*
   * A clean submission before every test, from the server rather than the UI.
   *
   * `resetUploader` puts the WIDGET back; this puts the ROW back, and only the
   * second one survives a re-run. The fixture is seeded with no submission, so
   * run one passed and every run after it met an uploader already holding a
   * document — status still `not_started`, `document` quietly non-null — and the
   * preview-before-upload flow these specs exist to assert never rendered.
   *
   * Seeding cannot fix that: seeds run at boot and the dev server stays up for
   * days. A fixture that only works once is not a fixture.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto('/kyc');
    await resetKycFixture(page);
  });

  test('opens on the first incomplete step', async ({ page }) => {
    await page.goto('/kyc');
    await page.waitForURL(/\/kyc\/step\/\d/);

    // A client with nothing submitted belongs at the beginning.
    await expect(page).toHaveURL(/\/kyc\/step\/1/);
  });

  // Un-fixme'd: the per-spec API reset this was waiting on is the `beforeEach`
  // above. "Replace" never returned the tile to the state showing both capture
  // routes, so this asserted against a tile it could not see; resetting the ROW
  // rather than the widget removes the problem instead of working around it.
  test('offers BOTH a camera and a file picker for a document', async ({ page }) => {
    /*
     * The requirement is both, and it is why this is not simply a `capture`
     * attribute: on iOS and Android a bare `capture` makes an input
     * camera-ONLY, which locks out anyone who photographed their ID with a
     * second device or already holds a scan.
     */
    await openDocumentStep(page);
    await resetUploader(page);

    await expect(page.getByRole('button', { name: /take photo/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /choose file/i }).first()).toBeVisible();

    // Two inputs: one asking for the rear camera, one asking for nothing.
    const withCapture = page.locator('input[type="file"][capture]');
    const withoutCapture = page.locator('input[type="file"]:not([capture])');
    await expect(withCapture.first()).toHaveAttribute('capture', 'environment');
    expect(await withoutCapture.count()).toBeGreaterThan(0);
  });

  test('PREVIEWS a chosen photo before sending it, and only uploads on confirm', async ({
    page,
  }) => {
    /*
     * The sharper half of the mobile problem. The uploader used to send the file
     * and then render a thumbnail, so the first shot was already on the API
     * host's disk and attached to the submission before the client had seen it
     * at any usable size — and every discarded attempt cost a full mobile upload
     * plus an orphaned identity document on the server.
     *
     * This also exercises the canvas normalisation for real: choosing the file
     * decodes it, draws it oriented, and re-encodes before anything is sent.
     */
    await openDocumentStep(page);
    await resetUploader(page);

    const uploads: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/kyc/upload')) uploads.push(r.method());
    });

    await page.locator('input[type="file"]:not([capture])').first().setInputFiles({
      name: 'passport.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // Shown, with a way out — and nothing sent yet.
    const confirm = page.getByRole('button', { name: /use this/i });
    await expect(confirm).toBeVisible();
    await expect(page.getByRole('button', { name: /retake/i })).toBeVisible();
    expect(uploads).toEqual([]);

    await confirm.click();

    // Now it is sent, and the tile says so.
    await expect(page.getByText(/uploaded/i).first()).toBeVisible({ timeout: 20_000 });
    expect(uploads).toEqual(['POST']);
  });

  test('warns that a tiny image may be unreadable, without refusing it', async ({ page }) => {
    /*
     * 1x1 is far below the readable floor, so this is the warning path. It is
     * advisory by decision: a legitimate small scan refused outright is a worse
     * outcome than a marginal one a reviewer can judge for themselves.
     */
    await openDocumentStep(page);
    await resetUploader(page);

    await page.locator('input[type="file"]:not([capture])').first().setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(page.getByRole('status')).toContainText(/hard to read/i);
    // Warned, not blocked.
    await expect(page.getByRole('button', { name: /use this/i })).toBeEnabled();
  });

  test('gives the profile fields mobile keyboards and autofill', async ({ page }) => {
    // The form is filled once, on a phone, with a keyboard over half the screen.
    // It carried no autoComplete at all, so a saved address was typed by hand.
    await page.goto('/kyc/step/1');
    await page.waitForLoadState('networkidle');

    const first = page.locator('input[autocomplete="given-name"]');
    await expect(first).toBeVisible();
    await expect(page.locator('input[autocomplete="family-name"]')).toBeVisible();

    // Date of birth is a native date input, so the OS picker opens rather than
    // a text keyboard.
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('uses the OS picker for the 250-option country list', async ({ page }) => {
    // A custom listbox of ~250 entries is a 250-item scroll on a phone with no
    // letter-jump. Long lists fall back to a native select for that reason.
    await page.goto('/kyc/step/1');
    // The fields render from `/kyc/config`, so the form does not exist until
    // that request lands. Asserting before it does was a race in this spec, not
    // a defect in the page.
    await page.waitForLoadState('networkidle');

    const nativeSelects = page.locator('select');
    expect(await nativeSelects.count()).toBeGreaterThan(0);
  });

  test('fits a 393px screen without sideways scrolling', async ({ page, isMobile }) => {
    // A form that overflows horizontally on a phone is one people abandon.
    test.skip(!isMobile, 'the point of this case is the mobile viewport');

    await page.goto('/kyc/step/1');
    await page.waitForLoadState('networkidle');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

test.describe('choosing a document but not confirming it', () => {
  test('says "confirm it", not "please upload"', async ({ page }) => {
    /*
     * Reported from the running app: "I'm getting please upload while I already
     * uploaded." The client was looking at their own photo, with the button
     * that sends it a few pixels away, being told to upload one.
     *
     * The step only knows what reached the SERVER, and a preview has not. So a
     * pending file and an empty tile were indistinguishable from here, and the
     * only message available was the one that was wrong. `onPendingChange`
     * closes that gap.
     */
    await openDocumentStep(page);
    await resetUploader(page);

    await page.locator('input[type="file"]:not([capture])').first().setInputFiles({
      name: 'passport.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    // Chosen, previewed, deliberately NOT confirmed.
    await expect(page.getByRole('button', { name: /use this/i })).toBeVisible();

    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByText(/use this/i).first()).toBeVisible();
    await expect(
      page.getByText(/please upload the front/i),
      'told to upload a document that is already on screen',
    ).toHaveCount(0);
  });

  test('keeps the field label visible while confirming', async ({ page }) => {
    /*
     * The address step has TWO tiles — "Primary Page (Page 1)" and "Page 2 /
     * Supporting Document" — and the preview state dropped the label, leaving
     * two identical cards showing a camera filename like 8683608071553.jpg.
     * That is what made one upload look like a duplicate of the other.
     */
    await page.goto('/kyc/step/4');
    await page.waitForLoadState('networkidle');

    const tiles = page.locator('input[type="file"]:not([capture])');
    if ((await tiles.count()) === 0) test.skip();

    await tiles.first().setInputFiles({
      name: 'bill.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(page.getByRole('button', { name: /use this/i }).first()).toBeVisible();
    await expect(
      page.getByText(/primary page/i).first(),
      'the tile stopped saying which document it is for',
    ).toBeVisible();
  });
});
