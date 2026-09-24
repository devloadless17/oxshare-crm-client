import { expect, test } from './fixtures';
import {
  adminApiSession,
  apiFromPage,
  kycStepPath,
  resetKycFixture,
  uploadKycFile,
} from './helpers';
import type { Page } from '@playwright/test';

/**
 * EXTRA QUESTIONS AND UPLOADS ON A BUILT-IN STEP — asked for in local testing:
 * "I need to be able to add new fields to steps like Proof of Address".
 *
 * Before, a File field on Proof of Address rendered an uploader the server
 * refused, and "required" on it blocked nothing: the step had nowhere to keep
 * it, so nothing could check it. Now a built-in step keeps its extras beside its
 * document, the server judges them with everything else (`kyc-step-state.ts`),
 * and Continue asks the server rather than deciding for itself.
 *
 * The fields are added to the LIVE address step for the run and taken off by id
 * afterwards; the step is read back and compared with what it was, so a
 * developer's configuration is left exactly as found.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

const TEXT = {
  id: 'f-e2e-extra-text',
  name: 'customField_e2e_landlord',
  label: 'E2E Landlord',
  type: 'text',
  required: true,
};
const FILE = {
  id: 'f-e2e-extra-file',
  name: 'customField_e2e_lease',
  label: 'E2E Lease',
  type: 'file',
  required: true,
};
const OURS = (field: { id: string }) => field.id.startsWith('f-e2e-extra');

type StepConfig = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  fields: {
    id: string;
    name: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }[];
};

let admin: Awaited<ReturnType<typeof adminApiSession>> | undefined;
let before: StepConfig | undefined;

async function addressStep(): Promise<StepConfig> {
  const res = await admin!.get('/admin/kyc-config');
  expect(res.ok(), 'could not read the KYC configuration').toBe(true);
  const body: unknown = await res.json();
  const steps = (
    Array.isArray(body) ? body : (body as { steps: StepConfig[] }).steps
  ) as StepConfig[];
  const step = steps.find((candidate) => candidate.slug === 'address');
  expect(step, 'this deployment has no Proof of Address step').toBeDefined();
  return step!;
}

async function putFields(step: StepConfig, fields: StepConfig['fields']): Promise<void> {
  const res = await admin!.put(`/admin/kyc-config/steps/${step.id}`, {
    slug: step.slug,
    title: step.title,
    description: step.description,
    icon: step.icon,
    enabled: step.enabled,
    fields,
  });
  expect(res.ok(), `the address step could not be saved: ${await res.text()}`).toBe(true);
}

test.beforeAll(async () => {
  admin = await adminApiSession();
  const current = await addressStep();
  // Sweep a run that was interrupted before its cleanup.
  before = { ...current, fields: current.fields.filter((field) => !OURS(field)) };
  expect(before.enabled, 'the Proof of Address step is disabled here').toBe(true);
  await putFields(before, [...before.fields, TEXT, FILE]);
});

test.afterAll(async () => {
  try {
    if (admin && before) {
      const current = await addressStep();
      await putFields(
        current,
        current.fields.filter((field) => !OURS(field)),
      );
      expect(await addressStep(), 'the Proof of Address step was not restored exactly').toEqual(
        before,
      );
    }
  } finally {
    await admin?.dispose();
  }
});

/** Every required plain field on the served address step, answered through the API. */
async function answerEveryExtra(page: Page): Promise<void> {
  const config = await apiFromPage(page, 'GET', '/kyc/config');
  const step = (config.body as StepConfig[]).find((candidate) => candidate.slug === 'address')!;
  const data: Record<string, string> = { docType: 'utility_bill' };
  for (const field of step.fields) {
    if (!field.required || field.type.startsWith('doc:')) continue;
    if (field.type === 'file' || field.type === 'camera') {
      expect(await uploadKycFile(page, field.name), `${field.label} was not stored`).toBeLessThan(
        400,
      );
    } else if (field.type === 'checkbox') {
      data[field.name] = field.options?.length ? field.options[0]! : 'true';
    } else if (field.type === 'select') {
      data[field.name] = field.options?.[0] ?? '';
    } else if (field.type === 'date') {
      data[field.name] = '1990-01-01';
    } else if (field.type === 'phone') {
      data[field.name] = '+961 70 123 456';
    } else {
      data[field.name] = field.name === TEXT.name ? 'Mr Haddad' : 'e2e answer';
    }
  }
  const saved = await apiFromPage(page, 'POST', '/kyc/step', { step: 'address', data });
  expect(saved.status, JSON.stringify(saved.body).slice(0, 200)).toBeLessThan(300);
}

test('a required question and upload on Proof of Address hold the step until answered, and reach the review', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the rule is LOGIC, not layout — and uploads share a per-minute budget');
  await page.goto('/kyc');
  await resetKycFixture(page);
  expect(
    await uploadKycFile(page, 'address_proof', 'utility_bill'),
    'the bill was not stored',
  ).toBeLessThan(400);

  // The document alone is not the whole step any more.
  const addressPath = await kycStepPath(page, 'address');
  await page.goto(addressPath);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /please (fill in|upload):/i }),
    'Continue let the step go without its required extras',
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${addressPath}$`));

  // Answered: the server says the step is done, and Continue moves on.
  await answerEveryExtra(page);
  await page.goto(addressPath);
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel(TEXT.label)).toHaveValue('Mr Haddad');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page, 'the answered step did not advance').not.toHaveURL(
    new RegExp(`${addressPath}$`),
    { timeout: 15_000 },
  );

  // And the reviewer's side of the client's screen shows both, from the server.
  await page.goto(await kycStepPath(page, 'review'));
  await page.waitForLoadState('networkidle');
  const title = (await addressStep()).title;
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(section).toContainText('Mr Haddad');
  await expect(section).toContainText(/E2E Lease\s*Uploaded/);
});
