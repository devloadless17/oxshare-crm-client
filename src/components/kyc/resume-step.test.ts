import { describe, expect, it } from 'vitest';
import { resumeStepNumber } from './resume-step';

/**
 * Reported from production: coming back to KYC always started at step 1, so a
 * client who had finished four steps pressed Continue through all of them to
 * find where they stopped.
 */

const doc = (name: string, value: string, parts: boolean[]) => ({
  name,
  label: name,
  type: `doc:${value}`,
  document: { value, category: 'identity', parts: parts.map((required) => ({ required })) },
});

const STEPS = [
  {
    slug: 'personal',
    stepNumber: 1,
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', required: true },
      { name: 'phone', label: 'Phone', type: 'phone', required: true },
    ],
  },
  {
    slug: 'document',
    stepNumber: 2,
    fields: [doc('passport', 'passport', [true]), doc('nationalId', 'national_id', [true, true])],
  },
  { slug: 'selfie', stepNumber: 3, fields: [{ name: 'selfie', label: 'Selfie', type: 'camera' }] },
  { slug: 'review', stepNumber: 4, fields: [] },
];

const PROFILE = { firstName: 'Jane', phone: '+961 70 123 456' };

describe('where a returning client lands', () => {
  it('a new client starts at the first step', () => {
    expect(resumeStepNumber(null, STEPS)).toBe(1);
  });

  it('skips the steps already complete', () => {
    expect(resumeStepNumber({ personalInfo: PROFILE }, STEPS)).toBe(2);
  });

  it('treats "+961" alone as an unanswered phone — the profile is not complete', () => {
    expect(resumeStepNumber({ personalInfo: { ...PROFILE, phone: '+961' } }, STEPS)).toBe(1);
  });

  it('asks for the national ID’s back before moving on', () => {
    const status = {
      personalInfo: PROFILE,
      document: { docType: 'national_id', frontFilePath: 'f.jpg' },
    };
    expect(resumeStepNumber(status, STEPS)).toBe(2);
  });

  it('reaches the review screen when everything is on file', () => {
    const status = {
      personalInfo: PROFILE,
      document: { docType: 'passport', frontFilePath: 'f.jpg' },
      selfie: { filePath: 's.jpg' },
    };
    expect(resumeStepNumber(status, STEPS)).toBe(4);
  });

  it('sends a correction round to the FIRST step holding what the reviewer returned', () => {
    const status = {
      personalInfo: PROFILE,
      document: { docType: 'passport', frontFilePath: 'f.jpg' },
      selfie: { filePath: 's.jpg' },
      rejectedFields: ['selfie', 'doc_front'],
    };
    expect(resumeStepNumber(status, STEPS)).toBe(2);
  });
});
