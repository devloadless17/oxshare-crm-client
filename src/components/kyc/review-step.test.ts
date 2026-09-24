import { describe, expect, it } from 'vitest';
import { withReviewStep } from './review-step';
import type { components } from '@/lib/api/types.gen';

type KycStepConfigDto = components['schemas']['KycStepConfigDto'];

/**
 * The review step is appended by the client, never configured.
 *
 * It carries the button that submits the whole application, so an operator who
 * deleted it would leave a flow with no way to finish and one who dragged it to
 * position 2 would leave a flow that submits before collecting anything.
 * Migration 0070 took the row out of `kyc_config_steps`.
 *
 * These pin the appending itself AND the property that made it go wrong: every
 * screen that renders the flow has to append it, or they disagree about how
 * many steps there are.
 */

const step = (stepNumber: number, slug: string): KycStepConfigDto => ({
  id: `step-${stepNumber}`,
  stepNumber,
  slug,
  title: slug,
  description: '',
  icon: 'FileText',
  enabled: true,
  fields: [],
});

const CONFIGURED = [
  step(1, 'personal'),
  step(2, 'document'),
  step(3, 'selfie'),
  step(4, 'address'),
];

describe('withReviewStep', () => {
  it('appends review after the configured steps', () => {
    const result = withReviewStep(CONFIGURED);

    expect(result).toHaveLength(5);
    expect(result[4]?.slug).toBe('review');
  });

  it('numbers it last, so the progress strip can highlight it', () => {
    /*
     * The bug this pins. `app/kyc/layout.tsx` built its strip straight from
     * `/kyc/config` while the form appended review — so a client standing on
     * "Review & Submit" saw four steps that did not include it, and the
     * `findIndex(...) + 1 || 1` fallback highlighted step ONE.
     */
    const result = withReviewStep(CONFIGURED);

    expect(result[4]?.stepNumber).toBe(5);
    // Contiguous 1..n, because the strip and the /kyc/step/[n] routes both key
    // on the number.
    expect(result.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('follows however many steps the broker configured', () => {
    // Two configured steps means review is step 3 — nothing here assumes four.
    const result = withReviewStep([step(1, 'personal'), step(2, 'selfie')]);

    expect(result).toHaveLength(3);
    expect(result[2]?.stepNumber).toBe(3);
  });

  it('adds nothing to an empty flow', () => {
    /*
     * A flow with no steps gets no review screen either, or the client lands on
     * "confirm your details" having entered none. Also the shape a failed
     * config fetch produces, and inventing a step there would paint a wizard
     * over an error.
     */
    expect(withReviewStep([])).toEqual([]);
  });
});

describe('a step disabled in the middle of the flow', () => {
  /*
   * Found in local testing with the selfie step disabled: the served steps kept
   * their builder numbers (1, 2, 3, 4, 6) while review was numbered by count
   * (6) — two steps numbered alike, and the wizard treated a real step as the
   * last one ("Submit Verification" where "Continue" belonged).
   */
  it('numbers every step by its place in THIS flow, review last and unique', () => {
    const result = withReviewStep([
      step(1, 'address'),
      step(2, 'document'),
      step(4, 'custom'),
      step(6, 'extra'),
    ]);
    expect(result.map((s) => [s.slug, s.stepNumber])).toEqual([
      ['address', 1],
      ['document', 2],
      ['custom', 3],
      ['extra', 4],
      ['review', 5],
    ]);
  });
});
