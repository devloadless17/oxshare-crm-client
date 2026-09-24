import { planCustomStep } from './custom-step';
import { isUploadField } from './doc-type';
import { storedFilesOf, type StatusFiles } from './upload-state';

/**
 * Where a client coming back to their verification should land.
 *
 * ## Reported from production: it always started at step 1
 *
 * `/kyc` sent every unfinished client to `/kyc/step/1`, so somebody who had
 * filled in four steps, left, and came back was shown their name and date of
 * birth again and had to press Continue through every screen to find where they
 * stopped. Steps are resumable by design — the answers were all saved — and the
 * entry point simply did not look at them.
 *
 * ## The rule
 *
 * A client returning with the reviewer's corrections goes to the FIRST STEP
 * HOLDING ONE, because that is what they came back to do. Anyone else goes to
 * the first step that is not complete, judged by the same rules the step itself
 * applies on Continue. When every step is complete, the review screen.
 *
 * Judged from what the SERVER holds — this runs before any step has loaded,
 * and a draft in this tab says nothing about what was saved.
 */

interface FieldLike {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  document?: { value: string; category?: string; parts: { required: boolean }[] };
}

interface StepLike {
  slug: string;
  stepNumber: number;
  fields: FieldLike[];
}

export interface ResumeStatus extends StatusFiles {
  personalInfo?: Record<string, unknown>;
}

const PAGE_SLOTS = {
  document: ['doc_front', 'doc_back'],
  address: ['address_proof', 'address_proof_2'],
} as const;

/** The step number to open; `steps` must already include the review step. */
export function resumeStepNumber(
  status: ResumeStatus | null | undefined,
  steps: readonly StepLike[],
): number {
  const answerable = steps.filter((step) => step.slug !== 'review');
  const review = steps.find((step) => step.slug === 'review');
  if (answerable.length === 0) return review?.stepNumber ?? 1;

  const flags = status?.rejectedFields ?? [];
  if (flags.length > 0) {
    const flaggedStep = answerable.find((step) => stepHolds(step, flags));
    if (flaggedStep) return flaggedStep.stepNumber;
  }

  const stored = storedFilesOf(status);
  const unfinished = answerable.find((step) => !isComplete(step, status, stored));
  return (unfinished ?? review ?? answerable[answerable.length - 1]!).stepNumber;
}

/** Does this step contain any of the flagged ids? */
function stepHolds(step: StepLike, flags: readonly string[]): boolean {
  const ids = new Set(step.fields.map((f) => f.name));
  if (step.slug === 'document' || step.slug === 'address') {
    for (const slot of PAGE_SLOTS[step.slug]) ids.add(slot);
  }
  if (step.slug === 'selfie') ids.add('selfie');
  return flags.some((id) => ids.has(id));
}

function isComplete(
  step: StepLike,
  status: ResumeStatus | null | undefined,
  stored: Record<string, string>,
): boolean {
  if (step.slug === 'selfie') return Boolean(stored['selfie']);

  if (step.slug === 'document' || step.slug === 'address') {
    const docType =
      step.slug === 'document' ? status?.document?.docType : status?.addressProof?.docType;
    const field = step.fields.find((f) => f.document && f.document.value === docType);
    // A document the step no longer offers, or none chosen: not done.
    if (!field?.document) return false;
    const slots = PAGE_SLOTS[step.slug];
    return field.document.parts.every((part, i) => !part.required || Boolean(stored[slots[i]!]));
  }

  // The personal step, or one the broker added: the same rules as Continue.
  const source = step.slug === 'personal' ? status?.personalInfo : status?.stepData?.[step.slug];
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') answers[key] = String(value);
  }
  const uploads: Record<string, boolean> = {};
  for (const field of step.fields)
    if (isUploadField(field)) uploads[field.name] = !!stored[field.name];

  const plan = planCustomStep(step, answers, uploads);
  return !plan.missing && !plan.invalid;
}
