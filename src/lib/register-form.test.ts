import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_FIELDS,
  DETAIL_FIELDS,
  EMPTY_REGISTER_VALUES,
  requiredDetailFields,
  firstErrorField,
  hasNationalNumber,
  missingFields,
  registerPayload,
  stepOf,
  type RegisterValues,
} from './register-form';

/**
 * The sign-up form's model. What it must never get wrong: which step a
 * server's refusal sends the client back to, when the phone input's
 * pre-filled dial code counts as an answer (never), and what goes on the wire
 * (blanks omitted, the password untouched).
 */

const filled: RegisterValues = {
  firstName: ' Layla ',
  lastName: 'Haddad',
  email: ' layla@example.test ',
  password: ' spaced pass ',
  dateOfBirth: '1991-03-09',
  nationality: 'Lebanese',
  phone: '+961 70 123 456',
  country: 'Lebanon',
  city: ' Beirut ',
  address: 'Hamra Street',
  postalCode: '',
};

describe('the two steps', () => {
  it('covers every field exactly once', () => {
    const all = [...ACCOUNT_FIELDS, ...DETAIL_FIELDS];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(Object.keys(EMPTY_REGISTER_VALUES).sort());
  });

  it('sends a refusal back to the step that shows the field', () => {
    for (const field of ACCOUNT_FIELDS) expect(stepOf(field), field).toBe(1);
    for (const field of DETAIL_FIELDS) expect(stepOf(field), field).toBe(2);
    // A field this form has never heard of is shown where the details are.
    expect(stepOf('somethingNew')).toBe(2);
  });

  it('names the first field in trouble in the order the form shows them', () => {
    expect(firstErrorField({ postalCode: 'x', lastName: 'y' })).toBe('lastName');
    expect(firstErrorField({ dateOfBirth: 'x', city: 'y' })).toBe('dateOfBirth');
    expect(firstErrorField({})).toBeUndefined();
    expect(firstErrorField({ referralCode: 'x' })).toBeUndefined();
  });
});

describe('what counts as answered', () => {
  // What `GET /profile/options` serves — the SERVER's rule, never a copy here.
  const OPTIONS = {
    required: {
      registration: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'phone', 'country'],
    },
  };
  const REQUIRED = requiredDetailFields(OPTIONS);

  it('asks for what the server requires on step 2, and leaves the address optional', () => {
    expect(REQUIRED).toEqual(['dateOfBirth', 'nationality', 'phone', 'country']);
    expect(missingFields(filled, REQUIRED)).toEqual([]);
  });

  it('claims nothing required before the server has said — the server still judges', () => {
    expect(requiredDetailFields(undefined)).toEqual([]);
  });

  it('treats blank and whitespace as missing', () => {
    const values = { ...filled, nationality: '   ', dateOfBirth: '' };
    expect(missingFields(values, REQUIRED)).toEqual(['dateOfBirth', 'nationality']);
  });

  it('counts a number typed WITH SPACES as a number — no four digits need be in a row', () => {
    expect(hasNationalNumber('+961 70 123 456')).toBe(true);
    expect(hasNationalNumber('+971 50 123 4567')).toBe(true);
  });

  it('never counts the phone input’s own dial code as a number', () => {
    for (const phone of ['', '+961', '+961 ', '+1', '+971 5']) {
      expect(missingFields({ ...filled, phone }, ['phone']), phone).toEqual(['phone']);
    }
    for (const phone of ['+961 70 123 456', '+96170123456', '+1 202 555 0143']) {
      expect(missingFields({ ...filled, phone }, ['phone']), phone).toEqual([]);
    }
  });
});

describe('what goes on the wire', () => {
  it('trims every field but the password, which is sent exactly as typed', () => {
    const body = registerPayload(filled, undefined);
    expect(body.firstName).toBe('Layla');
    expect(body.email).toBe('layla@example.test');
    expect(body.city).toBe('Beirut');
    expect(body.password).toBe(' spaced pass ');
  });

  it('omits a blank optional field rather than sending it empty', () => {
    const body = JSON.parse(JSON.stringify(registerPayload(filled, undefined))) as object;
    expect(body).not.toHaveProperty('postalCode');
    expect(body).not.toHaveProperty('referralCode');
  });

  it('omits a phone that is only its dial code', () => {
    const body = JSON.parse(
      JSON.stringify(registerPayload({ ...filled, phone: '+961' }, undefined)),
    ) as object;
    expect(body).not.toHaveProperty('phone');
  });

  it('carries the referral code when there is one', () => {
    expect(registerPayload(filled, 'K7M2PQR9').referralCode).toBe('K7M2PQR9');
  });

  it('sends every detail given, so the verification opens filled in', () => {
    expect(registerPayload(filled, undefined)).toMatchObject({
      dateOfBirth: '1991-03-09',
      nationality: 'Lebanese',
      phone: '+961 70 123 456',
      country: 'Lebanon',
      address: 'Hamra Street',
    });
  });
});
