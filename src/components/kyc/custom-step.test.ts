import { describe, expect, it } from 'vitest';
import { planCustomStep, uploadedCustomFields } from './custom-step';

/**
 * The rule these pin: a custom step is validated and SAVED like any other.
 *
 * Before this existed, `handleNext` branched on the five canonical slugs and a
 * custom step matched none of them — so it was never validated and never sent
 * to `/kyc/step`. A client filled it in, pressed Continue, and the answers were
 * gone.
 */

const text = (over: Partial<{ name: string; label: string; required: boolean }> = {}) => ({
  name: 'sourceOfFunds',
  label: 'Source of Funds',
  type: 'text',
  required: true,
  ...over,
});

const file = (over: Partial<{ name: string; label: string; required: boolean }> = {}) => ({
  name: 'customField_1789722395888',
  label: 'Proof of Income',
  type: 'file',
  required: true,
  ...over,
});

describe('planCustomStep', () => {
  it('names the first required field the client has not filled in', () => {
    const plan = planCustomStep({ fields: [text()] }, {}, {});
    expect(plan.missing?.name).toBe('sourceOfFunds');
    expect(plan.missingIsUpload, 'a text field is not an upload').toBe(false);
  });

  it('treats whitespace as empty, because a space is not an answer', () => {
    expect(
      planCustomStep({ fields: [text()] }, { sourceOfFunds: '   ' }, {}).missing,
    ).not.toBeNull();
  });

  it('passes once every required field has something in it', () => {
    const plan = planCustomStep({ fields: [text()] }, { sourceOfFunds: 'Salary' }, {});
    expect(plan.missing).toBeNull();
    expect(plan.answers).toEqual({ sourceOfFunds: 'Salary' });
  });

  it('asks for an UPLOAD when the missing field is a file, not "fill in the form"', () => {
    /*
     * The distinction is the whole reason `missingIsUpload` is returned: telling
     * a client to complete the required fields when what is missing is a
     * document sends them looking for a text box that is not there.
     */
    const plan = planCustomStep({ fields: [file()] }, {}, {});
    expect(plan.missing?.label).toBe('Proof of Income');
    expect(plan.missingIsUpload).toBe(true);
  });

  it('counts a file as present when it has been uploaded', () => {
    expect(
      planCustomStep({ fields: [file()] }, {}, { customField_1789722395888: true }).missing,
    ).toBeNull();
  });

  it('NEVER sends a file field back as a typed answer', () => {
    /*
     * The file's answer was written by `POST /kyc/upload`. Echoing a copy from
     * the form would let Continue overwrite the server's record of a document
     * with whatever this form happened to hold — losing the file reference.
     */
    const plan = planCustomStep(
      { fields: [text(), file()] },
      { sourceOfFunds: 'Salary', customField_1789722395888: 'stale' },
      { customField_1789722395888: true },
    );
    expect(plan.answers).toEqual({ sourceOfFunds: 'Salary' });
    expect(plan.answers).not.toHaveProperty('customField_1789722395888');
  });

  it('ignores an optional field left blank', () => {
    const plan = planCustomStep({ fields: [text({ required: false })] }, {}, {});
    expect(plan.missing).toBeNull();
    expect(plan.answers, 'a blank optional answer is still saved, as an empty string').toEqual({
      sourceOfFunds: '',
    });
  });

  it('is safe on a step with no fields at all', () => {
    expect(planCustomStep(undefined, {}, {})).toEqual({
      missing: null,
      missingIsUpload: false,
      answers: {},
    });
  });
});

describe('uploadedCustomFields', () => {
  it('finds the slots a stored file occupies, across every custom step', () => {
    expect(
      uploadedCustomFields({
        'extra-docs': { customField_1: { filePath: 'uploads/kyc/a.png', fileName: 'a.png' } },
        'more-docs': { customField_2: { filePath: 'uploads/kyc/b.png', fileName: 'b.png' } },
      }),
    ).toEqual(['customField_1', 'customField_2']);
  });

  it('ignores typed answers, which are not uploads', () => {
    expect(uploadedCustomFields({ compliance: { sourceOfFunds: 'Salary' } })).toEqual([]);
  });

  it('is safe on an absent or empty stepData', () => {
    expect(uploadedCustomFields(undefined)).toEqual([]);
    expect(uploadedCustomFields({})).toEqual([]);
  });
});
