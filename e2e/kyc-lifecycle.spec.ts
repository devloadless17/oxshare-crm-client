import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  adminApiSession,
  signIn,
  apiFromPage,
  APP_ORIGIN,
  csrfOf,
  linkIn,
  newClient,
  register,
  TINY_PNG,
  waitForMail,
} from './helpers';

/**
 * FR-CORE-15 / FR-IND-03 A→Z — the WHOLE identity-verification lifecycle, both
 * outcomes, on one fresh human being:
 *
 *   register → verify the email → complete the profile and the three document
 *   uploads → submit → an administrator CLAIMS and REJECTS with a reason → the
 *   client is TOLD (screen and inbox), re-applies, resubmits → the
 *   administrator APPROVES → the account is level 1 and the money doors open.
 *
 * Every earlier spec proved one still of this film (the wizard's uploader, the
 * reviewer's buttons, the mask); this is the film. It needs a FRESH client
 * because approval is terminal — a seeded fixture could run it exactly once.
 *
 * ONE long test, deliberately: the steps share one person, one session and one
 * submission, and each depends on everything before it. `test.step` gives the
 * report its chapters.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Upload a real PNG into a KYC slot, from INSIDE the page (cookies + CSRF). */
async function uploadSlot(page: Page, field: string): Promise<void> {
  const csrf = await csrfOf(page.context());
  const status = await page.evaluate(
    async ({
      base,
      field,
      csrf,
      png,
    }: {
      base: string;
      field: string;
      csrf: string;
      png: string;
    }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('file', new File([bytes], `${field}.png`, { type: 'image/png' }));
      form.append('field', field);
      const res = await fetch(`${base}/kyc/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-oxshare-csrf': csrf },
        body: form,
      });
      return res.status;
    },
    {
      base: (process.env.E2E_API_ORIGIN ?? 'http://localhost:3001') + '/v1',
      field,
      csrf,
      png: TINY_PNG.toString('base64'),
    },
  );
  expect(status, `uploading ${field} answered ${status}`).toBeLessThan(300);
}

test('a client is verified end to end: submit → reject with reason → resubmit → approve → level 1', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const client = newClient();

  await test.step('register, read the inbox, verify, sign in', async () => {
    await register(page, client);
    const mail = await waitForMail(client.email, { subject: /verify/i });
    await page.goto(linkIn(mail, APP_ORIGIN));
    await expect(page.getByText(/verified|welcome/i).first()).toBeVisible({ timeout: 15_000 });

    // Through the shared helper: it WAITS OUT the five-a-minute login cap
    // rather than failing the whole lifecycle on a harness-side 429.
    await signIn(page, client);
  });

  await test.step('complete the profile and the three documents', async () => {
    // The personal step, with every field the default config REQUIRES —
    // including the 18+ date of birth the server validates independently.
    const personal = await apiFromPage(page, 'POST', '/kyc/step', {
      step: 'personal',
      data: {
        firstName: 'Kaya',
        lastName: 'Lifecycle',
        dateOfBirth: '1990-01-01',
        phone: '+96170000009',
        nationality: 'Lebanon',
        country: 'Lebanon',
      },
    });
    expect(personal.status, 'saving the personal step failed').toBeLessThan(300);

    // Which document is being presented, then its photo; then the selfie and
    // the proof of address — the FR-CORE-15 trio.
    expect(
      (
        await apiFromPage(page, 'POST', '/kyc/step', {
          step: 'document',
          data: { docType: 'passport' },
        })
      ).status,
    ).toBeLessThan(300);
    await uploadSlot(page, 'doc_front');
    await uploadSlot(page, 'selfie');
    expect(
      (
        await apiFromPage(page, 'POST', '/kyc/step', {
          step: 'address',
          data: { docType: 'utility_bill' },
        })
      ).status,
    ).toBeLessThan(300);
    await uploadSlot(page, 'address_proof');
  });

  await test.step('submit from the review screen, and land on "submitted"', async () => {
    await page.goto('/kyc');
    await page.waitForURL(/\/kyc\/step\/\d/, { timeout: 20_000 });
    // The wizard resumes at the REVIEW step — everything before it is complete.
    await page.goto('/kyc/step/5');
    const [submitted] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/kyc/submit') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /submit verification/i }).click(),
    ]);
    expect(submitted.ok(), `submit answered ${submitted.status()}`).toBe(true);
    await page.waitForURL(/\/kyc\/submitted/, { timeout: 20_000 });
    await expect(page.getByText(/verification submitted/i).first()).toBeVisible();
  });

  const admin = await adminApiSession();
  let clientId = '';
  try {
    await test.step('an administrator claims it and REJECTS it, with a reason', async () => {
      const found = await admin.get(`/admin/clients?q=${encodeURIComponent(client.email)}&limit=5`);
      clientId =
        ((await found.json()) as { items: { id: string; email: string }[] }).items.find(
          (c) => c.email === client.email,
        )?.id ?? '';
      expect(clientId, 'the fresh client is not on the admin index').toBeTruthy();

      expect((await admin.patch(`/admin/kyc/${clientId}/claim`)).ok()).toBe(true);
      const rejected = await admin.patch(`/admin/kyc/${clientId}/reject`, {
        reason: 'The identity document is unreadable — e2e lifecycle check.',
        rejectedFields: ['document'],
      });
      expect(rejected.ok(), `reject answered ${rejected.status()}`).toBe(true);
    });

    await test.step('the client is told WHY, on screen and in their inbox', async () => {
      await page.goto('/kyc');
      await page.waitForURL(/\/kyc\/submitted/, { timeout: 20_000 });
      await expect(page.getByText(/unreadable — e2e lifecycle check/i)).toBeVisible();
      // The returned field is named, so they fix the right thing.
      await expect(page.getByText(/document/i).first()).toBeVisible();
      // And the way back in is offered.
      await expect(
        page.getByRole('link', { name: /update and re-?submit|re-?apply/i }),
      ).toBeVisible();

      const mail = await waitForMail(client.email, { subject: /kyc|verification/i });
      expect(`${mail.subject} ${mail.text}`).toMatch(/reject|not approved|returned|unreadable/i);
    });

    await test.step('they re-apply and resubmit — the documents survived the rejection', async () => {
      await page.getByRole('link', { name: /update and re-?submit|re-?apply/i }).click();
      await page.waitForURL(/\/kyc\/step\/\d/, { timeout: 20_000 });
      const resubmit = await apiFromPage(page, 'POST', '/kyc/submit');
      expect(resubmit.status, `resubmit answered ${resubmit.status}`).toBeLessThan(300);
    });

    await test.step('the administrator APPROVES, and the account reaches level 1', async () => {
      const approved = await admin.patch(`/admin/kyc/${clientId}/approve`);
      expect(approved.ok(), `approve answered ${approved.status()}`).toBe(true);

      const me = await apiFromPage(page, 'GET', '/auth/me');
      expect((me.body as { verificationLevel: number }).verificationLevel).toBe(1);
    });

    await test.step('level 1 opens the money doors — without signing in again', async () => {
      await page.goto('/withdraw');
      await expect(page, 'an approved client was still handed to KYC').toHaveURL(/\/withdraw/, {
        timeout: 20_000,
      });
      await page.goto('/deposit');
      await expect(page).toHaveURL(/\/deposit/, { timeout: 20_000 });
    });
  } finally {
    await admin.dispose();
  }
});
