import type { components } from '@/lib/api/types.gen';

type StepState = components['schemas']['KycStepStateDto'];

/**
 * Where a client coming back to their verification should land.
 *
 * ## Reported from production: it always started at step 1
 *
 * `/kyc` sent every unfinished client to `/kyc/step/1`, so somebody who had
 * filled in four steps, left, and came back was shown their name and date of
 * birth again and had to press Continue through every screen to find where they
 * stopped.
 *
 * ## The rule
 *
 * A client returning with the reviewer's corrections goes to the FIRST STEP
 * HOLDING ONE, because that is what they came back to do. Anyone else goes to
 * the first step that is not complete. When every step is complete, the review
 * screen.
 *
 * "Complete" is the SERVER's verdict (`steps` on `/kyc/status`, from
 * `kyc-step-state.ts`) — the same judgement `submit` applies. This file used to
 * re-derive it with its own copy of the rules, which is how a client could be
 * resumed past a step the server would later refuse.
 */

interface StepLike {
  slug: string;
  stepNumber: number;
}

/** The step number to open; `steps` must already include the review step. */
export function resumeStepNumber(
  status: { status?: string; steps?: readonly StepState[] } | null | undefined,
  steps: readonly StepLike[],
): number {
  const answerable = steps.filter((step) => step.slug !== 'review');
  const review = steps.find((step) => step.slug === 'review');
  if (answerable.length === 0) return review?.stepNumber ?? 1;

  // A FIRST visit opens the first step (26 Sep 2026): the personal step comes
  // pre-filled from sign-up, and a client who typed their address there would
  // otherwise be taken past their own details to the document upload — the
  // details the documents are checked against, never seen and confirmed.
  if (status?.status === 'not_started') return answerable[0]!.stepNumber;

  const stateOf = (slug: string) => status?.steps?.find((state) => state.slug === slug);
  const returned = answerable.find((step) => (stateOf(step.slug)?.returned.length ?? 0) > 0);
  if (returned) return returned.stepNumber;

  // A step with no verdict is not known to be done — open it rather than skip it.
  const unfinished = answerable.find((step) => !stateOf(step.slug)?.complete);
  return (unfinished ?? review ?? answerable[answerable.length - 1]!).stepNumber;
}
