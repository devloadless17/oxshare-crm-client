import { describe, expect, it } from 'vitest';
import { languageFromLink } from './link-locale';

/**
 * An emailed link carries its email's language (`?lang=`), and the proxy
 * remembers it and sends the visitor on without it. What must never break is
 * the REST of the address: the welcome and reset links ARE their token.
 */
describe('a link carrying its language', () => {
  it('keeps every other parameter, the token first of all', () => {
    expect(languageFromLink('/auth/reset-password', '?token=abc123&welcome=1&lang=ar')).toEqual({
      target: '/auth/reset-password?token=abc123&welcome=1',
      locale: 'ar',
    });
  });

  it('leaves a bare address when the language was all it carried', () => {
    expect(languageFromLink('/kyc', '?lang=en')).toEqual({ target: '/kyc', locale: 'en' });
  });

  it('drops a language this portal does not speak, remembering nothing', () => {
    expect(languageFromLink('/auth/login', '?lang=fr&next=%2Fwallet')).toEqual({
      target: '/auth/login?next=%2Fwallet',
      locale: null,
    });
  });

  it('leaves every other link alone', () => {
    expect(languageFromLink('/auth/reset-password', '?token=abc123')).toBeNull();
    expect(languageFromLink('/dashboard', '')).toBeNull();
  });
});
