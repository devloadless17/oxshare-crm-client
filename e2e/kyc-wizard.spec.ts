import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  TINY_PNG,
  kycStepPath,
  openDocumentStep,
  openTypedDocumentStep,
  resetKycFixture,
  requirePrecondition,
} from './helpers';

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
  test('offers a camera where one opens, and a file picker everywhere', async ({ page }) => {
    /*
     * The requirement is both ROUTES, and it is why this is not simply a
     * `capture` attribute: on iOS and Android a bare `capture` makes an input
     * camera-ONLY, which locks out anyone who photographed their ID with a
     * second device or already holds a scan.
     *
     * The BUTTON follows the device, and that is the fix this now pins.
     * `capture` is honoured by phones and IGNORED by every desktop browser, so
     * on a laptop "Take photo" opened the identical file dialog as "Choose
     * file" — two controls, one outcome, and a client on the verification step
     * guessing which one they got wrong. The camera button now renders only
     * where `(pointer: coarse)` is true, which is the same set of devices
     * whose file input actually opens a camera.
     */
    await openDocumentStep(page);
    await resetUploader(page);

    // The signal the component itself reads, asked of this project's device.
    const canCapture = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);

    await expect(page.getByRole('button', { name: /choose file/i }).first()).toBeVisible();
    if (canCapture) {
      await expect(page.getByRole('button', { name: /take photo/i }).first()).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: /take photo/i }),
        'a desktop browser ignores `capture`, so this button would open the same dialog',
      ).toHaveCount(0);
    }

    /*
     * BOTH inputs exist regardless — the capture-seeking one is what a phone
     * needs, and hiding its button on desktop must not remove the machinery a
     * touch device depends on.
     */
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
    await page.goto(await kycStepPath(page, 'personal'));
    await page.waitForLoadState('networkidle');

    const first = page.locator('input[autocomplete="given-name"]');
    await expect(first).toBeVisible();
    await expect(page.locator('input[autocomplete="family-name"]')).toBeVisible();

    // Date of birth is a native date input, so the OS picker opens rather than
    // a text keyboard.
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('every dropdown is the styled select — the native control is gone', async ({ page }) => {
    /*
     * REVERSED, on an explicit instruction. Long lists used to fall back to a
     * native <select> for the OS picker's type-ahead, and this test pinned
     * that. Every select on the form is the styled control now, so country
     * and nationality look like every other field, flags included. If
     * long-list picking on phones comes back as a complaint, the answer is a
     * search box inside the dropdown, not the native control's page-grey
     * chrome — see the note in step-field.tsx.
     */
    await page.goto(await kycStepPath(page, 'personal'));
    // The fields render from `/kyc/config`, so the form does not exist until
    // that request lands. Asserting before it does was a race in this spec, not
    // a defect in the page.
    await page.waitForLoadState('networkidle');

    expect(await page.locator('select').count()).toBe(0);
    const styled = page.getByRole('combobox');
    expect(await styled.count()).toBeGreaterThan(0);
    // And the styled listbox actually opens and offers the long list.
    await styled.first().click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('fits a 393px screen without sideways scrolling', async ({ page, isMobile }) => {
    // A form that overflows horizontally on a phone is one people abandon.
    test.skip(!isMobile, 'the point of this case is the mobile viewport');

    await page.goto(await kycStepPath(page, 'personal'));
    await page.waitForLoadState('networkidle');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

test.describe('choosing a document but not confirming it', () => {
  /*
   * The SAME per-test reset the wizard describe above runs, and for the same
   * reason — it was missing here, which is why these cases passed alone and
   * failed after their siblings.
   *
   * `resetUploader` puts the WIDGET back; this puts the ROW back. Without it
   * an earlier test's confirmed upload survives in `kyc_submissions`, the
   * step renders the uploaded tile rather than an empty one, and
   * `input[type=file]` never appears at all — a 60-second timeout that reads
   * as "the uploader is broken" when the fixture is simply dirty.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto('/kyc');
    await resetKycFixture(page);
  });

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
     * Reported behaviour this guards: choosing a file swapped the tile for a
     * preview and DROPPED its label, leaving cards that showed only a camera
     * filename like 8683608071553.jpg — so on a step with more than one tile
     * an operator could not tell which document each was for, and one upload
     * looked like a duplicate of the other.
     *
     * ⚠️ This test asserted the literal text "Primary Page", and had not run
     * in a long time. Migration 0072 deliberately retired that wording (a
     * utility bill is one page; its part is "The Bill"), and the step's shape
     * differs between a freshly migrated database and one an operator has
     * edited in the KYC builder — three direct tiles in one, a type choice
     * revealing parts in the other. The `requirePrecondition` above was
     * skipping the whole case on any database of the second shape, so it went
     * green by never running and its assertion quietly went stale.
     *
     * It reads the label OFF THE TILE now and asserts that same text survives
     * the preview. That is the actual regression, it does not care which
     * document types are configured, and it cannot go stale against a rename.
     */
    await openTypedDocumentStep(page, 'address', /utility bill|bank statement|tenancy/i);

    const tiles = page.locator('input[type="file"]:not([capture])');
    requirePrecondition(
      (await tiles.count()) === 0,
      'no document tiles rendered for this KYC step',
    );

    // The tile's own caption, whatever the configuration calls it. Read from
    // the FIRST tile, which is the one the upload below goes into.
    const tile = page.getByTestId('kyc-document-tile').first();
    await expect(tile).toBeVisible();
    // The FIRST paragraph is the caption; the ones after it are the hint and
    // the state text. `textContent()` on the tile itself runs them together
    // with no separator, which is why this reads the element and not the tile.
    const labelBefore = ((await tile.locator('p').first().textContent()) ?? '').trim();
    expect(labelBefore, 'the tile had no caption to begin with').not.toBe('');

    await tiles.first().setInputFiles({
      name: 'bill.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // Chosen and previewed, deliberately not confirmed — the state the label
    // used to vanish in.
    await expect(page.getByRole('button', { name: /use this/i }).first()).toBeVisible();
    await expect(
      tile.getByText(labelBefore, { exact: false }),
      'the tile stopped saying which document it is for',
    ).toBeVisible();
  });
});
