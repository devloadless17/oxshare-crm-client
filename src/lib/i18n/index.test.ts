import { afterEach, describe, expect, it } from 'vitest';
import {
  currentLocale,
  direction,
  intlLocale,
  localized,
  setActiveLocale,
  t,
  translate,
} from './index';
import { LOCALE_COOKIE, parseLocale, readStoredLocale, storeLocale } from './locale-storage';

afterEach(() => {
  setActiveLocale('en');
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
});

describe('translate', () => {
  it('reads the requested catalogue, whatever the active locale is', () => {
    setActiveLocale('en');
    expect(translate('ar', 'nav.wallet')).toBe('المحفظة');
    expect(translate('en', 'nav.wallet')).toBe('Wallet');
  });

  it('t() follows the active locale', () => {
    setActiveLocale('ar');
    expect(t('nav.wallet')).toBe('المحفظة');
    expect(currentLocale()).toBe('ar');
  });

  it('fills placeholders in either order', () => {
    expect(translate('en', 'meta.pageTitle', { page: 'Wallet' })).toBe('Wallet — OXShare');
    expect(translate('ar', 'language.switchTo', { language: 'English' })).toBe(
      'التبديل إلى English',
    );
  });

  it('leaves a missing placeholder visible rather than printing undefined', () => {
    expect(translate('en', 'meta.pageTitle', { page: undefined })).toBe('{page} — OXShare');
  });
});

describe('plurals', () => {
  // `kyc.pageCount` is a six-branch selector in Arabic and two-branch in English.
  it('English two-branch: singular for exactly 1', () => {
    expect(translate('en', 'kyc.pageCount', { count: 1 })).toBe('1 photo');
    expect(translate('en', 'kyc.pageCount', { count: 2 })).toBe('2 photos');
    expect(translate('en', 'kyc.pageCount', { count: 0 })).toBe('0 photos');
  });

  it('Arabic six-branch: zero, one, dual, 3–10 plural, 11+ singular, 100 other', () => {
    expect(translate('ar', 'kyc.pageCount', { count: 0 })).toBe('لا توجد صور');
    expect(translate('ar', 'kyc.pageCount', { count: 1 })).toBe('صورة واحدة');
    expect(translate('ar', 'kyc.pageCount', { count: 2 })).toBe('صورتان');
    expect(translate('ar', 'kyc.pageCount', { count: 3 })).toBe('3 صور');
    expect(translate('ar', 'kyc.pageCount', { count: 11 })).toBe('11 صورة');
    expect(translate('ar', 'kyc.pageCount', { count: 100 })).toBe('100 صورة');
  });

  it('accepts the count as a string, the way the API sends numbers', () => {
    expect(translate('ar', 'kyc.pageCount', { count: '2' })).toBe('صورتان');
  });
});

describe('direction and Intl', () => {
  it('Arabic is RTL; English LTR', () => {
    expect(direction('ar')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });

  it('Arabic dates use Western digits; English keeps the browser default', () => {
    expect(intlLocale('ar')).toBe('ar-u-nu-latn');
    expect(intlLocale('en')).toBeUndefined();
    const formatted = new Date(Date.UTC(2026, 9, 2)).toLocaleDateString(intlLocale('ar'), {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/[؀-ۿ]/);
    expect(formatted).not.toMatch(/[٠-٩]/);
  });
});

describe('localized — operator text with an optional Arabic twin', () => {
  it('Arabic when the locale is Arabic and one was written', () => {
    expect(localized('Passport', 'جواز السفر', 'ar')).toBe('جواز السفر');
  });

  it('English when the locale is English', () => {
    expect(localized('Passport', 'جواز السفر', 'en')).toBe('Passport');
  });

  it('falls back to English when the Arabic is missing or blank — never an empty label', () => {
    // On an Arabic page the English comes back ISOLATED (FSI … PDI), so bidi lays
    // it out as English: bare, "Created by the walkthrough." printed with its full
    // stop at the wrong end (Arabic end-to-end test, 3 Oct 2026).
    const isolated = 'FSIPassportPDI'.replace('FSI', '⁨').replace('PDI', '⁩');
    expect(localized('Passport', undefined, 'ar')).toBe(isolated);
    expect(localized('Passport', null, 'ar')).toBe(isolated);
    expect(localized('Passport', '   ', 'ar')).toBe(isolated);
  });

  it('isolates only real English: an empty value, a number or Arabic comes back as is', () => {
    expect(localized('', null, 'ar')).toBe('');
    expect(localized('2026', null, 'ar')).toBe('2026');
    expect(localized('جواز السفر', null, 'ar')).toBe('جواز السفر');
    // English pages are byte-for-byte what they were.
    expect(localized('Created by the walkthrough.', null, 'en')).toBe(
      'Created by the walkthrough.',
    );
  });
});

describe('the locale cookie', () => {
  it('round-trips a choice', () => {
    storeLocale('ar');
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=ar`);
    expect(readStoredLocale()).toBe('ar');
  });

  it('ignores a value it does not know', () => {
    document.cookie = `${LOCALE_COOKIE}=fr; Path=/`;
    expect(readStoredLocale()).toBeNull();
    expect(parseLocale('fr')).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });

  it('carries over a choice the localStorage builds made', () => {
    window.localStorage.setItem(LOCALE_COOKIE, 'ar');
    expect(readStoredLocale()).toBe('ar');
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=ar`);
    window.localStorage.removeItem(LOCALE_COOKIE);
  });
});
