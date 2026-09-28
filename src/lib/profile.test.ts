import { describe, expect, it } from 'vitest';
import { addressLine, formatDateOfBirth, formatPhone, isProfileKey } from './profile';

/**
 * How the profile READS. Each helper has a wrong version that looks right in
 * most places and wrong in one: a birthday shown a day early west of Greenwich,
 * a phone as an unbroken run of digits, an address with dangling commas.
 */

describe('formatDateOfBirth', () => {
  it('prints the stored calendar day, whatever the viewer’s time zone', () => {
    // Built in UTC: read as local midnight it would be 14 June in the Americas.
    expect(formatDateOfBirth('1990-06-15')).toBe('15 June 1990');
    expect(formatDateOfBirth('2000-01-01')).toBe('1 January 2000');
    expect(formatDateOfBirth('1996-02-29')).toBe('29 February 1996');
  });

  it('shows anything else as it is, and nothing as nothing', () => {
    expect(formatDateOfBirth(undefined)).toBeUndefined();
    expect(formatDateOfBirth('')).toBeUndefined();
    expect(formatDateOfBirth('15/06/1990')).toBe('15/06/1990');
  });
});

describe('formatPhone', () => {
  it('groups a stored E.164 number the way it is read', () => {
    expect(formatPhone('+96170123456')).toBe('+961 70 123 456');
    expect(formatPhone('+971501234567')).toBe('+971 50 123 4567');
  });

  it('shows a number it cannot parse unchanged, and nothing as nothing', () => {
    expect(formatPhone('12')).toBe('12');
    expect(formatPhone('  ')).toBeUndefined();
    expect(formatPhone(null)).toBeUndefined();
  });
});

describe('addressLine', () => {
  it('joins what is there, and only what is there', () => {
    expect(addressLine({ address: 'Hamra Street', city: 'Beirut', postalCode: '1103' })).toBe(
      'Hamra Street, Beirut, 1103',
    );
    expect(addressLine({ address: 'Hamra Street', city: ' ', postalCode: null })).toBe(
      'Hamra Street',
    );
    expect(addressLine({ city: 'Dubai' })).toBe('Dubai');
    expect(addressLine({})).toBeUndefined();
  });

  it('puts the state between the city and the postal code (28 Sep 2026)', () => {
    expect(
      addressLine({
        address: 'Main Road',
        city: 'Jounieh',
        stateProvince: 'Mount Lebanon',
        postalCode: '1200',
      }),
    ).toBe('Main Road, Jounieh, Mount Lebanon, 1200');
  });
});

describe('isProfileKey', () => {
  it('knows the profile’s fields, and nothing a broker invented', () => {
    expect(isProfileKey('dateOfBirth')).toBe(true);
    expect(isProfileKey('postalCode')).toBe(true);
    expect(isProfileKey('customField_1790000000001')).toBe(false);
    expect(isProfileKey('email')).toBe(false);
  });
});
