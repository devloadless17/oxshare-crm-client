import { isUploadField } from './doc-type';

/**
 * What a step the BROKER added needs before the client may continue, and what
 * the wizard should save for it.
 *
 * ## Why this exists at all
 *
 * `handleNext` branches on the canonical slugs — `personal`, `document`,
 * `selfie`, `address`, `review` — and a custom step matched none of them, so it
 * fell straight through to the navigation. Two things followed, both reported
 * from production:
 *
 *  - a `required` field on a custom step was never checked, so Continue always
 *    worked however little was filled in; and
 *  - `/kyc/step` was never called for it, so everything typed into a custom
 *    step was DISCARDED on Continue. The step rendered, accepted input, and
 *    threw it away.
 *
 * ## Why it is a module rather than lines inside the component
 *
 * `kyc-step-form.tsx` is capped at 340 lines and the cap may not be raised —
 * the same constraint that produced `saved-answers.ts`. Pulling it out also
 * makes the rule testable without a wizard, a router and a QueryClient, which
 * is what makes it worth pinning at all.
 */

/** The shape this module needs off a configured field — structural on purpose. */
interface FieldLike {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}

export interface CustomStepPlan {
  /** The first required field with nothing in it, or null when the step is complete. */
  missing: FieldLike | null;
  /** True when `missing` is a file field, so the caller can say "upload" not "fill in". */
  missingIsUpload: boolean;
  /**
   * The TYPED answers to save.
   *
   * A file field is deliberately absent: its answer was written by
   * `POST /kyc/upload` and echoing a copy from this form would let the step
   * overwrite the server's record of a document with whatever the form held.
   */
  answers: Record<string, string>;
}

export function planCustomStep(
  step: { fields?: FieldLike[] } | undefined,
  formData: Record<string, string>,
  uploads: Record<string, boolean>,
): CustomStepPlan {
  const fields = step?.fields ?? [];

  const missing =
    fields
      .filter((f) => f.required)
      .find((f) =>
        isUploadField(f) ? !uploads[f.name] : !String(formData[f.name] ?? '').trim(),
      ) ?? null;

  const answers: Record<string, string> = {};
  for (const field of fields) {
    if (isUploadField(field)) continue;
    answers[field.name] = String(formData[field.name] ?? '');
  }

  return { missing, missingIsUpload: missing ? isUploadField(missing) : false, answers };
}

/**
 * The upload slots a custom step already holds a file for.
 *
 * `uploadsState` is seeded from the four canonical columns; a custom step's
 * uploads live under its own slug in `stepData`, so without this the client
 * comes back to the step, sees an empty uploader, and is asked again for a
 * document the server is already holding — the upload twin of the empty-answers
 * bug `savedAnswersFor` exists to prevent.
 */
export function uploadedCustomFields(
  stepData: Record<string, Record<string, unknown>> | undefined,
): string[] {
  const keys: string[] = [];
  for (const answers of Object.values(stepData ?? {})) {
    for (const [key, value] of Object.entries(answers ?? {})) {
      if (value && typeof value === 'object' && 'filePath' in value) keys.push(key);
    }
  }
  return keys;
}
