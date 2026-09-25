import { describe, expect, it } from 'vitest';
import { answersToSave, isBarePhonePrefix, isCompletePhone } from './custom-step';

/**
 * What the wizard SENDS for a step. Whether that is enough is the server's
 * verdict (`kyc-step-state.ts`), pinned in the backend — this module used to
 * judge too, and the two judges disagreeing was a week of bug reports.
 */

const text = (over: Partial<{ name: string; label: string; required: boolean }> = {}) => ({
  name: 'sourceOfFunds',
  label: 'Source of Funds',
  type: 'text',
  required: true,
  ...over,
});

const file = {
  name: 'customField_1789722395888',
  label: 'Proof of Income',
  type: 'file',
  required: true,
};

describe('answersToSave', () => {
  it('sends every typed answer, trimmed — a blank one as an empty string', () => {
    expect(
      answersToSave(
        { fields: [text(), text({ name: 'employer' })] },
        { sourceOfFunds: ' Salary ' },
      ),
    ).toEqual({ sourceOfFunds: 'Salary', employer: '' });
  });

  it('NEVER sends a file field back as a typed answer', () => {
    /*
     * The file's answer was written by `POST /kyc/upload`. Echoing a copy from
     * the form would let Continue overwrite the server's record of a document
     * with whatever this form happened to hold — losing the file reference.
     */
    const answers = answersToSave(
      { fields: [text(), file] },
      { sourceOfFunds: 'Salary', customField_1789722395888: 'stale' },
    );
    expect(answers).toEqual({ sourceOfFunds: 'Salary' });
  });

  it('never sends a catalogue document’s choice as an answer either', () => {
    const passport = { name: 'passport', label: 'Passport', type: 'doc:passport' };
    expect(answersToSave({ fields: [passport] }, { passport: 'x' })).toEqual({});
  });

  it('reads a country code alone as NOTHING — the reported "+961"', () => {
    const phone = { name: 'phone', label: 'Phone Number', type: 'phone', required: true };
    expect(answersToSave({ fields: [phone] }, { phone: '+961' })).toEqual({ phone: '' });
    expect(answersToSave({ fields: [phone] }, { phone: ' +961 70 123 456 ' })).toEqual({
      phone: '+961 70 123 456',
    });
  });

  it('sends a "tick all that apply" answer exactly as the field built it', () => {
    const funds = { name: 'funds', label: 'Funds', type: 'checkbox', options: ['Salary', 'Gift'] };
    expect(answersToSave({ fields: [funds] }, { funds: 'Salary, Gift' })).toEqual({
      funds: 'Salary, Gift',
    });
  });

  it('is safe on a step with no fields at all', () => {
    expect(answersToSave(undefined, {})).toEqual({});
  });
});

describe('the phone helpers the server shares', () => {
  it('knows a bare calling code from a number somebody started', () => {
    expect(isBarePhonePrefix('+961')).toBe(true);
    expect(isBarePhonePrefix('+961 7')).toBe(false);
  });

  it('accepts only a dialable number', () => {
    expect(isCompletePhone('+961 70 12')).toBe(false);
    expect(isCompletePhone('+961 70 123 456')).toBe(true);
  });
});
