import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage } from './browser-language';

describe('the language a phone asks for, before the visitor chooses one', () => {
  it('opens in Arabic for an Arabic phone', () => {
    expect(localeFromAcceptLanguage('ar-LB,ar;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('ar');
    expect(localeFromAcceptLanguage('ar')).toBe('ar');
  });
  it('opens in English for an English phone', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,ar;q=0.8')).toBe('en');
  });
  it('takes the first language it speaks, by weight, skipping ones it does not', () => {
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7')).toBe('ar');
    expect(localeFromAcceptLanguage('en;q=0.5,ar;q=0.8')).toBe('ar');
  });
  it('has no opinion when it speaks none of them', () => {
    expect(localeFromAcceptLanguage('fr-FR,de;q=0.9')).toBeNull();
    expect(localeFromAcceptLanguage('ar;q=0')).toBeNull();
    expect(localeFromAcceptLanguage('')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});
