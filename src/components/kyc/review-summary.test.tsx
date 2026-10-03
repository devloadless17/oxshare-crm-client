import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { setActiveLocale } from '@/lib/i18n';
import { ReviewSummary } from './review-summary';
import type { components } from '@/lib/api/types.gen';

/**
 * The review screen renders what the SERVER holds and the server's verdict on
 * every step — the same judgement `submit` applies. Each case is something it
 * got wrong while it read the tab's own form state (reported from local testing).
 */

type Status = components['schemas']['KycStatusDto'];
type Step = components['schemas']['KycStepConfigDto'];

const docField = (
  name: string,
  value: string,
  label: string,
  parts: string[],
  category = 'identity',
) => ({
  id: name,
  name,
  label,
  type: `doc:${value}` as Step['fields'][number]['type'],
  required: false,
  document: {
    value,
    label,
    // The catalogue's Arabic, as the API serves it (0179).
    labelAr: `ar:${label}`,
    category: category as 'identity' | 'address',
    parts: parts.map((part, i) => ({
      key: i === 0 ? 'front' : 'back',
      label: part,
      labelAr: `ar:${part}`,
      required: true,
    })),
  },
});

const STEPS: Step[] = [
  {
    id: 's1',
    stepNumber: 1,
    slug: 'personal',
    title: 'Personal Information',
    enabled: true,
    fields: [{ id: 'f1', name: 'firstName', label: 'First Name', type: 'text', required: true }],
  },
  {
    id: 's2',
    stepNumber: 2,
    slug: 'document',
    title: 'Identity Document',
    enabled: true,
    fields: [
      docField('passport', 'passport', 'Passport', ['Photo Page']),
      docField('nationalId', 'national_id', 'National ID', ['Front Side', 'Back Side']),
    ],
  },
  {
    id: 's3',
    stepNumber: 3,
    slug: 'address',
    title: 'Proof of Address',
    enabled: true,
    fields: [
      docField('utilityBill', 'utility_bill', 'Utility Bill', ['The Bill'], 'address'),
      { id: 'f9', name: 'prooof3', label: 'Lease', type: 'file', required: true },
    ],
  },
  { id: 's4', stepNumber: 4, slug: 'review', title: 'Review & Submit', enabled: true, fields: [] },
];

const complete = (slug: string) => ({ slug, complete: true, missing: [], returned: [] });

const STATUS = {
  userId: 'u1',
  status: 'in_progress',
  createdAt: new Date().toISOString(),
  personalInfo: { firstName: 'Jane' },
  document: { docType: 'national_id', frontFilePath: 'f.png', backFilePath: 'b.png' },
  addressProof: { docType: 'utility_bill', filePath: 'bill.png' },
  stepData: {},
  steps: [
    complete('personal'),
    complete('document'),
    {
      slug: 'address',
      complete: false,
      missing: [{ id: 'prooof3', label: 'Lease', kind: 'upload' }],
      returned: [],
    },
  ],
} as unknown as Status;

const sectionOf = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

describe('the review screen, read off the server', () => {
  it('shows the document ON FILE — never a card clicked and not uploaded ("Passport — Missing")', () => {
    renderWithProviders(<ReviewSummary title="Review" steps={STEPS} status={STATUS} />);
    const identity = sectionOf('Identity Document');
    expect(identity).toHaveTextContent('National ID · Front Side');
    expect(identity).toHaveTextContent('National ID · Back Side');
    expect(identity).not.toHaveTextContent(/passport|missing/i);
  });

  it('shows an answer saved in an earlier session, from the server', () => {
    renderWithProviders(<ReviewSummary title="Review" steps={STEPS} status={STATUS} />);
    expect(sectionOf('Personal Information')).toHaveTextContent('Jane');
  });

  it('says what is still owed, where, with a way straight there', () => {
    renderWithProviders(<ReviewSummary title="Review" steps={STEPS} status={STATUS} />);
    const owed = screen.getByRole('status');
    expect(owed).toHaveTextContent(/Before you submit/);
    expect(within(owed).getByRole('link', { name: 'Proof of Address' })).toHaveAttribute(
      'href',
      '/kyc/step/3',
    );
    expect(owed).toHaveTextContent('Lease');
    expect(sectionOf('Proof of Address')).toHaveTextContent(/Lease\s*Missing/);
  });

  it('says nothing is owed when the server says so', () => {
    const done = { ...STATUS, steps: STATUS.steps.map((s) => complete(s.slug)) } as Status;
    renderWithProviders(<ReviewSummary title="Review" steps={STEPS} status={done} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('the review screen in Arabic', () => {
  beforeEach(() => setActiveLocale('ar'));
  afterEach(() => setActiveLocale('en'));

  const arabicSteps: Step[] = [
    {
      ...STEPS[0]!,
      titleAr: 'المعلومات الشخصية',
      fields: [
        {
          id: 'f1',
          name: 'firstName',
          label: 'First Name',
          labelAr: 'الاسم الأول',
          type: 'text',
          required: true,
        },
        {
          id: 'f2',
          name: 'country',
          label: 'Country',
          labelAr: 'البلد',
          type: 'select',
          required: true,
          options: ['Lebanon'],
          optionsAr: { Lebanon: 'لبنان' },
        },
      ],
    },
    { ...STEPS[1]!, titleAr: 'وثيقة الهوية' },
  ];
  const status = {
    ...STATUS,
    personalInfo: { firstName: 'Jane', country: 'Lebanon' },
    steps: [complete('personal'), complete('document')],
  } as unknown as Status;

  it('titles each section, labels each answer and shows a choice in Arabic', () => {
    renderWithProviders(<ReviewSummary title="مراجعة" steps={arabicSteps} status={status} />);
    const personal = sectionOf('المعلومات الشخصية');
    expect(personal).toHaveTextContent('الاسم الأول');
    expect(personal).toHaveTextContent('البلد');
    // The stored English answer, read in Arabic — the value itself is untouched.
    expect(personal).toHaveTextContent('لبنان');
    expect(personal).not.toHaveTextContent('Lebanon');
  });

  it("names the document and its pages by the catalogue's Arabic", () => {
    renderWithProviders(<ReviewSummary title="مراجعة" steps={arabicSteps} status={status} />);
    expect(sectionOf('وثيقة الهوية')).toHaveTextContent('ar:National ID · ar:Front Side');
  });
});
