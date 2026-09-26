import { expect, test } from './fixtures';
import { adminApiSession, apiFromPage, kycStepPath, requirePrecondition } from './helpers';

/**
 * EXTRA QUESTIONS AND UPLOADS BELONG ON A STEP OF THE BROKER'S OWN — never on a
 * built-in document step (the owner's ruling, 26 Sep 2026).
 *
 * This file used to prove the opposite. Local testing asked for "new fields on
 * steps like Proof of Address", and a built-in step kept its extras beside its
 * document. The ruling that replaced it: Identity Document, Proof of Address and
 * the Selfie hold only what they are for, so a document a client sends is never
 * mixed with a form of the broker's, and a reviewer reads additional information
 * as what it is — in its own section. Migration 0147 moved every existing extra
 * onto a step of their own ("Additional documents"), answers included.
 *
 * What the extras DO — a required question and upload holding a step until
 * answered, a custom file never landing on the passport — is proved on a
 * broker's step by `kyc-custom-step-portal.spec.ts`. This file proves the door
 * is shut, and that the client never meets the old shape.
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
  required: true,
};
const FILE: Field = {
  id: 'f-e2e-extra-file',
  name: 'customField_e2e_lease',
  label: 'E2E Lease',
  type: 'file',
  required: true,
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

test('Proof of Address refuses a question and an upload, and says where they go instead', async ({
  isMobile,
}) => {
  test.skip(isMobile, 'a rule of the API — nothing here is layout');
  const before = await addressStep();

  for (const extra of [TEXT, FILE]) {
    const res = await admin!.put(`/admin/kyc-config/steps/${before.id}`, {
      slug: before.slug,
      title: before.title,
      description: before.description,
      icon: before.icon,
      enabled: before.enabled,
      fields: [...before.fields, extra],
    });
    expect(res.status(), `"${extra.label}" was accepted onto Proof of Address`).toBe(400);
    const body = (await res.json()) as { message?: string; fields?: Record<string, string> };
    // The sentence names the way on, not only the refusal — and is placed on the field.
    expect(body.message).toMatch(/holds only its documents/i);
    expect(body.message).toMatch(/a step of your own/i);
    expect(Object.keys(body.fields ?? {}).some((key) => /\.fields\.\d+$/.test(key))).toBe(true);
  }

  expect(await addressStep(), 'a refused save changed the step anyway').toEqual(before);
});

test('the client’s Proof of Address step asks for its documents and nothing else', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the served form is the same on every screen');
  await page.goto('/kyc');

  // What the portal is served: address documents only.
  const config = await apiFromPage(page, 'GET', '/kyc/config');
  const step = (config.body as StepConfig[]).find((candidate) => candidate.slug === 'address');
  expect(step, 'the portal is served no Proof of Address step').toBeDefined();
  requirePrecondition(
    !step!.enabled,
    'Proof of Address is switched off here — there is no step to look at',
  );
  expect(
    step!.fields.filter((field) => !field.type.startsWith('doc:')).map((field) => field.label),
    'the portal was served something other than documents on Proof of Address',
  ).toEqual([]);

  // What the client sees: the documents to choose from, and no form beside them.
  await page.goto(await kycStepPath(page, 'address'));
  await page.waitForLoadState('networkidle');
  const main = page.locator('main');
  for (const field of step!.fields) {
    await expect(main.getByRole('button', { name: new RegExp(field.label, 'i') })).toBeVisible();
  }
  await expect(main.getByRole('textbox')).toHaveCount(0);
});
