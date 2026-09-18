import type { components } from '@/lib/api/types.gen';

type KycStatus = components['schemas']['KycStatusDto'];
type KycStepConfig = components['schemas']['KycStepConfigDto'];

/**
 * The answers already on the server for the step being shown.
 *
 * ## Why a custom step needs its own lookup
 *
 * The four canonical steps store into named columns and arrive as
 * `personalInfo`. A step a broker added stores under its own slug in `stepData`
 * (backend migration 0130), so a wizard that read only `personalInfo` showed it
 * EMPTY on return: a client who filled half of it, left and came back would
 * retype their own answers — and on the last step, submit a form they believed
 * they had already finished. Steps are deliberately resumable, so leaving and
 * returning is the expected path rather than an edge case.
 *
 * ## Why it is a module function rather than a closure
 *
 * It was written inline in the seeding effect, which pushed that component past
 * its pinned `max-lines` cap and made `stepConfigs`/`stepNumber` closure
 * dependencies the effect did not declare. Taking the two as ARGUMENTS makes
 * the dependency explicit at the call site instead of implicit in a closure —
 * and this is a pure string-to-string transform, which is the shape most worth
 * testing and least worth hiding inside a hook.
 */
export function savedAnswersFor(
  // `null` as well as `undefined`: react-query hands back null before the
  // first fetch resolves, and a seeding effect runs in exactly that window.
  data: KycStatus | null | undefined,
  steps: readonly KycStepConfig[],
  stepNumber: number,
): Record<string, string> {
  const slug = steps.find((s) => s.stepNumber === stepNumber)?.slug ?? steps[stepNumber - 1]?.slug;

  return {
    ...stringify(data?.personalInfo),
    ...(slug ? stringify(data?.stepData?.[slug]) : {}),
  };
}

/**
 * Every value as a string, dropping the absent ones.
 *
 * `null` and `undefined` are filtered rather than stringified: `String(null)` is
 * `"null"`, which would seed a form field with the word null and, on a required
 * field, pass a non-empty check.
 */
function stringify(source: Record<string, unknown> | undefined): Record<string, string> {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}
