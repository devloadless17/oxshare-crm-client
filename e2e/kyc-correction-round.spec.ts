import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApiSession,
  apiFromPage,
  APP_ORIGIN,
  csrfOf,
  linkIn,
  newClient,
  register,
  signIn,
  TINY_PNG,
  waitForMail,
} from './helpers';

/**
 * The KYC fixes reported from production on 24 Sep 2026, in the browser, on one
 * fresh client:
 *
 *  - coming back to KYC always started at step 1 — it now RESUMES;
 *  - a phone of "+961" alone was accepted — it is now refused, by name;
 *  - an upload never said which document it was, so a passport stood in for a
 *    national ID — the page now carries its document type;
 *  - a rejection that landed while the socket was down never reached the
 *    outcome screen — it arrives live;
 *  - a rejected passport looked accepted, and could be sent straight back — it
 *    is now marked on its card and its tile, and must be replaced.
 *
 * ONE test, like the lifecycle spec: every step depends on the one before it,
 * and a fresh client is needed because a decision cannot be undone.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const API = (process.env.E2E_API_ORIGIN ?? 'http://localhost:3001') + '/v1';

/** Upload a real PNG into a slot from INSIDE the page, as the portal would. */
async function uploadSlot(page: Page, field: string, docType?: string): Promise<void> {
  const csrf = await csrfOf(page.context());
  const status = await page.evaluate(
    async ({ base, field, docType, csrf, png }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('file', new File([bytes], `${field}.png`, { type: 'image/png' }));
      form.append('field', field);
      if (docType) form.append('docType', docType);
      const res = await fetch(`${base}/kyc/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-oxshare-csrf': csrf },
        body: form,
      });
      return res.status;
    },
    { base: API, field, docType, csrf, png: TINY_PNG.toString('base64') },
  );
  expect(status, `uploading ${field} answered ${status}`).toBeLessThan(300);
}

/** Pick a file in the first document tile and confirm it — the client's own path. */
async function uploadThroughTile(page: Page): Promise<void> {
  await page
    .locator('[data-testid="kyc-document-tile"] input[type="file"]')
    .first()
    .setInputFiles({ name: 'passport.png', mimeType: 'image/png', buffer: TINY_PNG });
  const [upload] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/kyc/upload') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /^use this$/i }).click(),
  ]);
  expect(upload.ok(), `the tile's upload answered ${upload.status()}`).toBe(true);

  // The page said WHICH document it belongs to: the server holds it as a
  // passport before Continue is pressed. It used to guess, and only Continue
  // corrected it — how a passport stood in for a national ID.
  const status = await apiFromPage(page, 'GET', '/kyc/status');
  const document = (status.body as { document?: { docType?: string; frontFilePath?: string } })
    .document;
  expect(document?.docType).toBe('passport');
  expect(document?.frontFilePath).toBeTruthy();
}

test('a returned passport must be replaced, and the wizard resumes where the client is', async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'a correction round is LOGIC, not layout — and each run registers a client and spends the upload budget',
  );
  test.setTimeout(300_000);
  const client = newClient();

  await test.step('register, verify, sign in', async () => {
    await register(page, client);
    const mail = await waitForMail(client.email, { subject: /verify/i });
    await page.goto(linkIn(mail, APP_ORIGIN));
    await expect(page.getByText(/verified|welcome/i).first()).toBeVisible({ timeout: 15_000 });
    await signIn(page, client);
  });

  await test.step('a profile saved without a phone number resumes on the profile', async () => {
    const saved = await apiFromPage(page, 'POST', '/kyc/step', {
      step: 'personal',
      data: {
        firstName: 'Round',
        lastName: 'Trip',
        dateOfBirth: '1990-01-01',
        nationality: 'Lebanese',
        country: 'Lebanon',
        phone: '+961',
      },
    });
    expect(saved.status).toBeLessThan(300);

    await page.goto('/kyc');
    await expect(page).toHaveURL(/\/kyc\/step\/1$/, { timeout: 20_000 });
  });

  await test.step('"+961" alone is not a phone number, and a short one is named', async () => {
    const next = page.getByRole('button', { name: /^continue$/i });
    await next.click();
    await expect(page.getByText(/please fill in: phone number/i).first()).toBeVisible();

    const phone = page.getByLabel(/phone number/i);
    await phone.fill('70 12');
    await next.click();
    await expect(page.getByText(/enter your full number/i).first()).toBeVisible();

    await phone.fill('70 123 456');
    await next.click();
    await expect(page).toHaveURL(/\/kyc\/step\/2$/, { timeout: 20_000 });
  });

  await test.step('the passport page is uploaded through its tile, naming the document', async () => {
    await page
      .getByRole('button', { name: /passport/i })
      .first()
      .click();
    await uploadThroughTile(page);
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page).toHaveURL(/\/kyc\/step\/3$/, { timeout: 20_000 });
  });

  await test.step('with everything on file, /kyc resumes on the review screen', async () => {
    await uploadSlot(page, 'selfie');
    const address = await apiFromPage(page, 'POST', '/kyc/step', {
      step: 'address',
      data: { docType: 'utility_bill' },
    });
    expect(address.status).toBeLessThan(300);
    await uploadSlot(page, 'address_proof', 'utility_bill');

    await page.goto('/kyc');
    await expect(page).toHaveURL(/\/kyc\/step\/5$/, { timeout: 20_000 });
    await expect(page.getByText(/review & submit/i).first()).toBeVisible();
    // Built from the configured steps, with nothing that is not an answer.
    await expect(page.locator('main')).not.toContainText(/\[object Object\]|customField_/);
    await expect(page.locator('main')).not.toContainText(/missing/i);

    await page.getByRole('button', { name: /submit verification/i }).click();
    await expect(page).toHaveURL(/\/kyc\/submitted/, { timeout: 20_000 });
    await expect(page.getByText(/verification submitted/i).first()).toBeVisible();
  });

  const admin = await adminApiSession();
  try {
    await test.step('the rejection arrives LIVE on the outcome screen', async () => {
      const found = await admin.get(`/admin/clients?q=${encodeURIComponent(client.email)}&limit=5`);
      const clientId =
        ((await found.json()) as { items: { id: string; email: string }[] }).items.find(
          (c) => c.email === client.email,
        )?.id ?? '';
      expect(clientId, 'the fresh client is not on the admin index').toBeTruthy();

      const rejected = await admin.patch(`/admin/kyc/${clientId}/reject`, {
        reason: 'The passport photo is blurred — e2e correction round.',
        rejectedFields: ['doc_front'],
      });
      expect(rejected.ok(), `reject answered ${rejected.status()}`).toBe(true);

      // No reload: the socket's event refreshes the status the screen reads.
      await expect(page.getByText(/blurred — e2e correction round/i)).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('re-applying opens the step holding the returned passport, marked red', async () => {
      await page.getByRole('link', { name: /update and re-?submit|re-?apply/i }).click();
      await expect(page).toHaveURL(/\/kyc\/step\/2$/, { timeout: 20_000 });
      await expect(
        page.getByRole('button', { name: /passport/i }).first(),
        'the passport card does not say it was returned',
      ).toContainText(/returned for correction/i);
      await expect(page.getByText(/upload a replacement/i).first()).toBeVisible();
      // Kept with the report, so the returned state can be looked at, not only asserted.
      await page.screenshot({
        path: test.info().outputPath('returned-passport.png'),
        fullPage: true,
      });
    });

    await test.step('the same passport cannot go back', async () => {
      await page.getByRole('button', { name: /^continue$/i }).click();
      await expect(page.getByText(/please upload/i).first()).toBeVisible();

      const straightBack = await apiFromPage(page, 'POST', '/kyc/submit');
      expect(straightBack.status).toBe(400);
      expect(JSON.stringify(straightBack.body)).toMatch(
        /replace the documents the reviewer returned/i,
      );
    });

    await test.step('a new passport settles it, and the submission goes back', async () => {
      await uploadThroughTile(page);
      // The CARD stops saying it was returned. (The page banner keeps the
      // reviewer's reason in view until the submission goes back — on purpose.)
      await expect(page.getByRole('button', { name: /passport/i }).first()).not.toContainText(
        /returned/i,
      );
      await page.getByRole('button', { name: /^continue$/i }).click();
      await expect(page).toHaveURL(/\/kyc\/step\/3$/, { timeout: 20_000 });

      await page.goto('/kyc/step/5');
      await page.getByRole('button', { name: /submit verification/i }).click();
      await expect(page).toHaveURL(/\/kyc\/submitted/, { timeout: 20_000 });
      await expect(page.getByText(/verification submitted/i).first()).toBeVisible();
    });
  } finally {
    await admin.dispose();
  }
});
