import { expect, test } from '@playwright/test';
import { KYC_STORAGE_STATE, TINY_PNG, resetKycFixture } from './helpers';

/**
 * The KYC upload journey, end to end, through a real browser and into Cloudflare R2.
 *
 * ## What this covers that nothing else does
 *
 * `scripts/r2-e2e.mjs` in the backend already drives the same endpoints over HTTP and
 * checks 111 properties — bytes, checksums, registry rows, ranges, every rejection.
 * It cannot check the things that only exist in a browser:
 *
 *  - the document actually RENDERS. The bytes now come from R2 through the API
 *    proxy, and both apps ship a strict CSP (`img-src 'self' data:`). If the move
 *    had gone to presigned URLs on `*.r2.cloudflarestorage.com`, every one of these
 *    images would be blocked by our own policy and no HTTP test would notice.
 *  - no CSP violation or console error is raised while doing it.
 *  - the upload survives the real `FormData` a browser builds, including the
 *    canvas re-encode the mobile uploader performs before sending.
 *
 * ## Why the assertions are about the SEAM
 *
 * Per this suite's own rule: anything assertable with testing-library belongs in a
 * `.test.tsx`. What is here is whole-journey and cross-origin behaviour — which is
 * exactly where the storage move could break something invisibly.
 */

test.use({ storageState: KYC_STORAGE_STATE });

test.describe('KYC documents live in object storage', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate FIRST: `resetKycFixture` reads `document.cookie`, which throws a
    // SecurityError on `about:blank` because there is no origin to read it from.
    await page.goto('/kyc');
    await resetKycFixture(page);
  });

  test('uploads a document into object storage, with no CSP violation', async ({ page }) => {
    /*
     * Anything the browser refuses to load is collected, not just logged.
     *
     * A blocked image is the failure mode this whole test exists for, and it is
     * SILENT: the page renders, the layout is right, and the picture is missing.
     * Collecting console errors turns that into a failing assertion.
     */
    const violations: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && /content security policy|refused to load/i.test(text)) {
        violations.push(text);
      }
    });

    /*
     * Every request for a stored document, so the ORIGIN can be asserted.
     *
     * The portal usually makes NONE: after uploading it shows the local preview it
     * already decoded, rather than fetching the file back. So this is a conditional
     * assertion here — the read path is exercised properly by the ADMIN spec, where
     * a reviewer actually opens the document. What matters in both places is the
     * same: if a request is made, it must be same-origin.
     */
    const documentRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/uploads/kyc/')) documentRequests.push(r.url());
    });

    await page.goto('/kyc/step/2');

    const uploadResponse = page.waitForResponse(
      (r) => r.url().includes('/kyc/upload') && r.request().method() === 'POST',
    );

    await page.locator('input[type="file"]:not([capture])').first().setInputFiles({
      name: 'passport.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    // The uploader PREVIEWS before sending; "Use this" is what actually uploads.
    // Matching the label the wizard spec already pins, rather than a guess.
    await page.getByRole('button', { name: /use this/i }).click();

    const response = await uploadResponse;
    expect(response.status(), await response.text()).toBe(201);
    await expect(page.getByText(/uploaded/i).first()).toBeVisible({ timeout: 20_000 });

    /*
     * SAME ORIGIN, if anything is fetched at all.
     *
     * Reads are proxied through the API rather than redirected to a presigned R2
     * URL, precisely because `img-src 'self' data:` would block the redirect. If
     * somebody later switches to presigning without widening the CSP, this fails
     * here — and in the admin spec, where it would otherwise silently blank every
     * reviewer's screen.
     */
    for (const url of documentRequests) {
      expect(new URL(url).origin).toBe(new URL(page.url()).origin);
      expect(url).not.toContain('r2.cloudflarestorage.com');
    }

    expect(violations, `CSP blocked something:\n${violations.join('\n')}`).toEqual([]);
  });

  test('never stores an HTML document disguised as a PNG', async ({ page }) => {
    /*
     * The stored-XSS case, driven the way an attacker would: through the real form.
     *
     * TWO defences can stop it and the test accepts either, because both are real:
     *
     *  1. CLIENT-SIDE. The uploader decodes the chosen file onto a canvas and
     *     re-encodes it before sending. HTML does not decode, so it is usually
     *     refused here and no request is made at all.
     *  2. SERVER-SIDE. If anything ever reaches the endpoint — a different
     *     uploader, a crafted request, a future refactor that drops the canvas
     *     step — `StoredFilesService` sniffs the magic bytes and answers 400.
     *
     * Asserting only the 400 would make this fail the moment the client defence
     * improves, which is backwards. What must hold is that NOTHING IS STORED, and
     * that the client is told rather than left on a spinner.
     */
    await page.goto('/kyc/step/2');

    const uploadStatuses: number[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/kyc/upload') && r.request().method() === 'POST') {
        uploadStatuses.push(r.status());
      }
    });

    await page
      .locator('input[type="file"]:not([capture])')
      .first()
      .setInputFiles({
        name: 'passport.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<!DOCTYPE html><script>alert(document.cookie)</script></html>'),
      });

    const confirm = page.getByRole('button', { name: /use this/i });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
      // It reached the endpoint, so the server's magic-byte check must refuse it.
      await expect.poll(() => uploadStatuses.length, { timeout: 20_000 }).toBeGreaterThan(0);
      expect(uploadStatuses.every((s) => s >= 400)).toBe(true);
    }

    // Either way: it never became a stored document, and the wizard still works.
    await expect(page.getByText(/uploaded/i)).toHaveCount(0);
    await expect(page.locator('input[type="file"]').first()).toBeAttached();
  });
});
