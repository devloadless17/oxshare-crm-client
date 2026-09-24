import { describe, expect, it } from 'vitest';
import { resumeStepNumber } from './resume-step';

/**
 * Reported from production: coming back to KYC always started at step 1, so a
 * client who had finished four steps pressed Continue through all of them to
 * find where they stopped. Where they land is read off the SERVER's verdict on
 * each step — the same one `submit` applies — never re-derived here.
 */

const STEPS = [
  { slug: 'personal', stepNumber: 1 },
  { slug: 'document', stepNumber: 2 },
  { slug: 'selfie', stepNumber: 3 },
  { slug: 'review', stepNumber: 4 },
];

type Kind = 'choice' | 'page' | 'upload' | 'answer' | 'invalid' | 'returned';
const owed = (id: string, kind: Kind = 'answer', blocking?: boolean) => ({
  id,
  label: id,
  kind,
  ...(blocking === undefined ? {} : { blocking }),
});
const state = (
  slug: string,
  missing: ReturnType<typeof owed>[] = [],
  returned: ReturnType<typeof owed>[] = [],
) => ({
  slug,
  complete: missing.length === 0 && !returned.some((item) => item.blocking),
  missing,
  returned,
});

describe('where a returning client lands', () => {
  it('a client with no verdict yet starts at the first step', () => {
    expect(resumeStepNumber(null, STEPS)).toBe(1);
  });

  it('skips the steps the server calls complete', () => {
    const status = {
      steps: [state('personal'), state('document', [owed('docType', 'choice')]), state('selfie')],
    };
    expect(resumeStepNumber(status, STEPS)).toBe(2);
  });

  it('reaches the review screen when every step is complete', () => {
    const status = { steps: [state('personal'), state('document'), state('selfie')] };
    expect(resumeStepNumber(status, STEPS)).toBe(4);
  });

  it('opens a step the server gave no verdict on, rather than skipping it', () => {
    expect(resumeStepNumber({ steps: [state('personal')] }, STEPS)).toBe(2);
  });

  it('sends a correction round to the FIRST step holding what the reviewer returned', () => {
    // Even a returned ANSWER, which does not block: it is what they came back to fix.
    const status = {
      steps: [
        state('personal'),
        state('document'),
        state('selfie', [], [owed('selfie', 'returned', true)]),
      ],
    };
    expect(resumeStepNumber(status, STEPS)).toBe(3);
    const typed = { steps: [state('personal', [], [owed('firstName', 'returned', false)])] };
    expect(resumeStepNumber(typed, STEPS)).toBe(1);
  });
});
