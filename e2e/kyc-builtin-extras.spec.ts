import { expect, test } from './fixtures';
import { adminApiSession, kycStepPath, requirePrecondition } from './helpers';

/**
 * A BUILT-IN STEP TAKES THE BROKER'S OWN QUESTIONS (Phase 2, 29 Sep 2026 — the
 * owner: "every step in the builder must be able from me to add in it fields").
 *
 * From 26 Sep until then this file proved the opposite: Identity Document,
 * Proof of Address and the Selfie held only their documents, and extras went on
 * a step of the broker's own. The owner reversed that. A question or an upload
 * on Proof of Address is asked there, beside the documents, and its answer is
 * stored under the step — a custom file never lands on the bill, the same rule
 * `kyc-custom-step-portal.spec.ts` proves for the passport.
 */

test.use({ storageState: 'e2e/.auth/kyc-client.json' });

type Field = { id: string; name: string; label: string; type: string; required: boolean };
type StepConfig = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  fields: Field[];
};

const TEXT: Field = {
  id: 'f-e2e-extra-text',
  name: 'customField_e2e_landlord',
  label: 'E2E Landlord',
  type: 'text',
  required: false,
};
const FILE: Field = {
  id: 'f-e2e-extra-file',
  name: 'customField_e2e_lease',
  label: 'E2E Lease',
  type: 'file',
  required: false,
};

let admin: Awaited<ReturnType<typeof adminApiSession>> | undefined;

test.beforeAll(async () => {
  admin = await adminApiSession();
});
test.afterAll(async () => {
  await admin?.dispose();
});

async function addressStep(): Promise<StepConfig> {
  const res = await admin!.get('/admin/kyc-config');
  expect(res.ok(), 'could not read the KYC configuration').toBe(true);
  const body: unknown = await res.json();
  const steps = (
    Array.isArray(body) ? body : (body as { steps: StepConfig[] }).steps
  ) as StepConfig[];
  const step = steps.find((candidate) => candidate.slug === 'address');
  expect(step, 'every configuration has the Proof of Address step').toBeDefined();
  return step!;
}

const saveAddressStep = (step: StepConfig, fields: Field[]) =>
  admin!.put(`/admin/kyc-config/steps/${step.id}`, {
    slug: step.slug,
    title: step.title,
    description: step.description,
    icon: step.icon,
    enabled: step.enabled,
    fields,
  });

test('Proof of Address asks the broker’s own question and upload beside its documents', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the served form is the same on every screen');
  const before = await addressStep();
  requirePrecondition(
    !before.enabled,
    'Proof of Address is switched off here — there is no step to look at',
  );

  const saved = await saveAddressStep(before, [...before.fields, TEXT, FILE]);
  expect(saved.status(), await saved.text()).toBe(200);
  try {
    await page.goto('/kyc');
    await page.goto(await kycStepPath(page, 'address'));
    await page.waitForLoadState('networkidle');
    const main = page.locator('main');

    // The documents are still the step's choices…
    for (const field of before.fields) {
      await expect(main.getByRole('button', { name: new RegExp(field.label, 'i') })).toBeVisible();
    }
    // …and the broker's question and upload are asked beside them.
    await expect(main.getByRole('textbox', { name: /E2E Landlord/ })).toBeVisible();
    await expect(main.getByText('E2E Lease', { exact: false })).toBeVisible();
  } finally {
    const restored = await saveAddressStep(before, before.fields);
    expect(restored.status(), 'FAILED TO RESTORE Proof of Address').toBe(200);
  }
});
