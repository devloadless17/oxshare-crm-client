import { isValidPhoneNumber } from 'libphonenumber-js/min';
import { isUploadField } from './doc-type';

/**
 * What a step's TYPED answers are, as the server should store them.
 *
 * ## It no longer decides whether a step is complete — the server does
 *
 * This module used to answer "may the client continue?" with its own copy of
 * the rules (`planCustomStep` → `missing`, `invalid`), while `submit` answered
 * with another. The copies drifted, and each drift reached a client as a
 * contradiction — Continue let them through and the last screen refused, or a
 * required upload blocked nothing (reported from local testing, 23–25 Sep
 * 2026). There is one judge now: the server's `kyc-step-state.ts`, returned on
 * every `/kyc/step` save and on `/kyc/status`, and Continue reads its verdict.
 *
 * What is left here is only what the wizard SENDS.
 */

/** The shape this module needs off a configured field — structural on purpose. */
interface FieldLike {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}

/**
 * The step's typed answers, trimmed, with a phone number holding only its
 * country code read as NOTHING.
 *
 * A file field is deliberately absent: its answer was written by
 * `POST /kyc/upload`, and echoing a copy from this form would let the step
 * overwrite the server's record of a document with whatever the form held.
 */
export function answersToSave(
  step: { fields?: FieldLike[] } | undefined,
  formData: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of step?.fields ?? []) {
    if (isUploadField(field)) continue;
    answers[field.name] = answerOf(field, formData[field.name]);
  }
  return answers;
}

/**
 * The picker writes the country code the moment a country is chosen, so "+961"
 * alone passed a required-field check and reached the reviewer as the client's
 * number (reported from production). The API reads it the same way
 * (`kyc-answers.ts` in the backend), so the two cannot disagree about whether
 * the field was answered.
 */
function answerOf(field: FieldLike, raw: string | undefined): string {
  const value = String(raw ?? '').trim();
  return field.type === 'phone' && isBarePhonePrefix(value) ? '' : value;
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
