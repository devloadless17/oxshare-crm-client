import { isValidPhoneNumber } from 'libphonenumber-js/min';
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
   * The first answer that is PRESENT but cannot be accepted: a phone number cut
   * short, or a date of birth under the minimum age. Checked only once nothing
   * is missing, so the client meets one problem at a time.
   */
  invalid: { field: FieldLike; reason: 'phone' | 'too_young' } | null;
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
  const valueOf = (field: FieldLike) => answerOf(field, formData[field.name]);

  const missing =
    fields
      .filter((f) => f.required)
      .find((f) => (isUploadField(f) ? !uploads[f.name] : !valueOf(f))) ?? null;

  const answers: Record<string, string> = {};
  let invalid: CustomStepPlan['invalid'] = null;
  for (const field of fields) {
    if (isUploadField(field)) continue;
    const value = valueOf(field);
    answers[field.name] = value;
    const reason = value ? problemOf(field, value) : undefined;
    if (!missing && !invalid && reason) invalid = { field, reason };
  }

  return { missing, missingIsUpload: missing ? isUploadField(missing) : false, invalid, answers };
}

/**
 * The answer as the server will store it: trimmed, and a phone number holding
 * only its country code read as NOTHING.
 *
 * The phone picker writes the code the moment a country is chosen, so "+961"
 * alone passed a required-field check and reached the reviewer as the client's
 * number (reported from production). The API reads it the same way
 * (`kyc-answers.ts` in the backend), so the two cannot disagree about whether
 * the field was answered.
 */
function answerOf(field: FieldLike, raw: string | undefined): string {
  const value = String(raw ?? '').trim();
  return field.type === 'phone' && isBarePhonePrefix(value) ? '' : value;
}

function problemOf(field: FieldLike, value: string): 'phone' | 'too_young' | undefined {
  if (field.type === 'phone') return isCompletePhone(value) ? undefined : 'phone';
  if (field.name === 'dateOfBirth' && isUnderMinimumAge(value, new Date())) return 'too_young';
  return undefined;
}

/**
 * A calling code with nothing after it — `+961`, or `+1684`, the longest the
 * picker offers. The picker writes a SPACE before anything typed, so `+961 7`
 * is a number somebody started, and is reported as incomplete, not missing.
 */
export function isBarePhonePrefix(value: string): boolean {
  return /^\+?\d{0,4}$/.test(value.trim());
}

/**
 * A dialable number for its country — libphonenumber's `min` metadata at the
 * SAME version the API validates with, so the form and the server agree.
 */
export function isCompletePhone(value: string): boolean {
  return isValidPhoneNumber(value);
}

/** The minimum age, which the API enforces at submission (`kyc-profile.ts`). */
export const MINIMUM_AGE_YEARS = 18;

/**
 * Younger than the minimum age on `asOf`, by calendar — someone born on 29
 * February turns 18 on 1 March in a common year. An unparseable date is not
 * this check's to judge; the date field cannot produce one.
 */
export function isUnderMinimumAge(dateOfBirth: string, asOf: Date): boolean {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const months = asOf.getUTCMonth() - dob.getUTCMonth();
  if (months < 0 || (months === 0 && asOf.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age < MINIMUM_AGE_YEARS;
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
