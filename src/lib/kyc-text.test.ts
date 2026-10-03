import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '@/lib/i18n';
import {
  answerText,
  displayOrder,
  docLabel,
  fieldHint,
  fieldLabel,
  optionLabel,
  sortByLabel,
  stepDescription,
  stepTitle,
} from './kyc-text';

/** Operator text that fell back to English, as an Arabic page shows it: isolated (FSI … PDI). */
const iso = (text: string) => `\u2068${text}\u2069`;

/**
 * The KYC configuration's words in the reader's language (0179). Every rule:
 * Arabic when reading Arabic AND it is not blank, else the English — and an
 * option's VALUE is never changed, only what is shown for it.
 */

const country = {
  name: 'country',
  label: 'Country',
  labelAr: 'البلد',
  options: ['Lebanon', 'United Arab Emirates', 'Zambia'],
  optionsAr: {
    Lebanon: 'لبنان',
    'United Arab Emirates': 'الإمارات العربية المتحدة',
    Zambia: 'زامبيا',
  },
};

afterEach(() => setActiveLocale('en'));

describe('in English', () => {
  it('shows the English everywhere, whatever Arabic was written', () => {
    expect(fieldLabel(country)).toBe('Country');
    expect(optionLabel(country, 'Lebanon')).toBe('Lebanon');
    expect(stepTitle({ title: 'Personal', titleAr: 'شخصي' })).toBe('Personal');
    expect(displayOrder(country, country.options)).toEqual(country.options);
  });
});

describe('in Arabic', () => {
  beforeEach(() => setActiveLocale('ar'));

  it('shows the Arabic, and the English where none (or a blank) was written', () => {
    expect(fieldLabel(country)).toBe('البلد');
    expect(fieldLabel({ label: 'Notes', labelAr: '   ' })).toBe(iso('Notes'));
    expect(fieldHint({ hint: 'As on your ID', hintAr: 'كما في هويتك' })).toBe('كما في هويتك');
    expect(fieldHint({ hint: undefined, hintAr: undefined })).toBeUndefined();
    expect(stepTitle({ title: 'Personal', titleAr: 'شخصي' })).toBe('شخصي');
    expect(stepDescription({ description: 'About you' })).toBe(iso('About you'));
    expect(stepDescription({})).toBeUndefined();
    expect(docLabel({ label: 'Passport', labelAr: 'جواز السفر' })).toBe('جواز السفر');
  });

  it("a document field kept at the catalogue's English takes the catalogue's Arabic", () => {
    const document = { label: 'Passport', labelAr: 'جواز السفر' };
    expect(fieldLabel({ label: 'Passport', document })).toBe('جواز السفر');
    // A broker's own wording is not the catalogue's — never mislabel it.
    expect(fieldLabel({ label: 'Travel document', document })).toBe(iso('Travel document'));
  });

  it('maps a stored English answer to its Arabic without changing it', () => {
    expect(optionLabel(country, 'Lebanon')).toBe('لبنان');
    expect(optionLabel(country, 'Atlantis')).toBe(iso('Atlantis'));
    expect(answerText({ type: 'select', ...country }, 'Lebanon')).toBe('لبنان');
    expect(answerText({ type: 'text' }, 'Beirut')).toBe('Beirut');
    const funds = {
      type: 'checkbox',
      options: ['Salary', 'Gift'],
      optionsAr: { Salary: 'الراتب', Gift: 'هدية' },
    };
    expect(answerText(funds, 'Salary, Gift')).toBe('الراتب، هدية');
  });

  it('re-sorts the country and nationality lists by the Arabic shown', () => {
    expect(displayOrder(country, country.options)).toEqual([
      'United Arab Emirates',
      'Zambia',
      'Lebanon',
    ]);
  });

  it("keeps a broker's own short list in the order they chose", () => {
    const employment = {
      name: 'employment',
      optionsAr: { Employed: 'موظف', Retired: 'متقاعد' },
    };
    expect(displayOrder(employment, ['Retired', 'Employed'])).toEqual(['Retired', 'Employed']);
  });

  it('sorts a profile list by its Arabic labels, values untouched', () => {
    expect(
      sortByLabel(['Lebanese', 'Emirati'], { Lebanese: 'لبناني', Emirati: 'إماراتي' }),
    ).toEqual(['Emirati', 'Lebanese']);
    expect(sortByLabel(['B', 'A'], undefined)).toEqual(['B', 'A']);
  });
});
