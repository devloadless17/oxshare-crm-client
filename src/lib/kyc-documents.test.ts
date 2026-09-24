import { describe, expect, it } from 'vitest';
import {
  kycDocumentState,
  kycDocumentsOf,
  personalDetailsOf,
  rejectedFieldLabels,
} from './kyc-documents';

/**
 * The client's own documents table.
 *
 * The rule worth pinning is the per-document state on a REJECTED submission:
 * a rejection that names fields returns only those files, and calling every
 * other row "rejected" sends the client to replace documents nobody objected to.
 * Both vocabularies a reviewer may use — storage ids and config field names —
 * must reach the right row.
 */

const steps = [
  {
    slug: 'document',
    title: 'Identity',
    fields: [
      {
        name: 'nationalId',
        label: 'National ID',
        document: {
          value: 'national_id',
          label: 'National ID',
          category: 'identity',
          parts: [
            { key: 'front', label: 'Front' },
            { key: 'back', label: 'Back' },
          ],
        },
      },
      {
        name: 'passport',
        label: 'Passport',
        document: {
          value: 'passport',
          label: 'Passport',
          category: 'identity',
          parts: [{ key: 'photo', label: 'Photo page' }],
        },
      },
    ],
  },
];

const submission = {
  status: 'rejected' as const,
  document: {
    docType: 'national_id',
    frontFilePath: 'uploads/kyc/a.jpg',
    backFilePath: 'uploads/kyc/b.jpg',
  },
  selfie: { filePath: 'uploads/kyc/s.jpg' },
  addressProof: { docType: 'utility_bill' },
  stepData: { extra: { proof: { filePath: 'uploads/kyc/x.pdf', fileName: 'x.pdf' }, note: 'hi' } },
};

describe('kycDocumentsOf', () => {
  it('lists only files that exist, labelled from the config', () => {
    const rows = kycDocumentsOf(submission, steps);
    expect(rows.map((r) => r.key)).toEqual(['doc_front', 'doc_back', 'selfie', 'extra:proof']);
    expect(rows[0]).toMatchObject({ type: 'National ID', part: 'Front' });
    expect(rows[1]).toMatchObject({ type: 'National ID', part: 'Back' });
    // The passport field does not collect the stored national ID.
    expect(rows[0]!.fieldKeys).toEqual(['doc_front', 'nationalId']);
  });

  it('names no part for a one-page document', () => {
    const rows = kycDocumentsOf(
      { status: 'submitted', document: { docType: 'passport', frontFilePath: 'p.jpg' } },
      steps,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'Passport', part: undefined });
  });

  it('returns nothing for a client who never started', () => {
    expect(kycDocumentsOf(null, steps)).toEqual([]);
  });
});

describe('kycDocumentState', () => {
  const [front, back, selfie] = kycDocumentsOf(submission, steps);

  it('rejects only the files a rejection named', () => {
    expect(kycDocumentState(selfie!, 'rejected', ['selfie'])).toBe('rejected');
    expect(kycDocumentState(front!, 'rejected', ['selfie'])).toBe('accepted');
  });

  it('matches a config field name to every page of that document', () => {
    expect(kycDocumentState(front!, 'rejected', ['nationalId'])).toBe('rejected');
    expect(kycDocumentState(back!, 'rejected', ['nationalId'])).toBe('rejected');
    expect(kycDocumentState(selfie!, 'rejected', ['nationalId'])).toBe('accepted');
  });

  it('returns every file when the rejection named nothing', () => {
    expect(kycDocumentState(selfie!, 'rejected', [])).toBe('rejected');
  });

  it('passes the submission state through otherwise', () => {
    expect(kycDocumentState(front!, 'approved')).toBe('approved');
    expect(kycDocumentState(front!, 'under_review')).toBe('in_review');
    expect(kycDocumentState(front!, 'in_progress')).toBe('not_submitted');
  });
});

describe('personalDetailsOf', () => {
  it('orders by the config, keeps unconfigured answers, drops internals and blanks', () => {
    const rows = personalDetailsOf(
      { dateOfBirth: '1990-01-01', firstName: 'Sam', __docChoice__personal: 'x', phone: ' ' },
      [
        {
          slug: 'personal',
          fields: [
            { name: 'firstName', label: 'First Name' },
            { name: 'phone', label: 'Phone' },
          ],
        },
      ],
    );
    expect(rows).toEqual([
      { key: 'firstName', label: 'First Name', value: 'Sam' },
      { key: 'dateOfBirth', label: 'Date of birth', value: '1990-01-01' },
    ]);
  });
});

describe('rejectedFieldLabels', () => {
  it('names a page, a whole document, or a configured field — never a raw id', () => {
    expect(
      rejectedFieldLabels(['doc_back', 'nationalId', 'selfie', 'dateOfBirth'], submission, steps),
    ).toEqual(['National ID · Back', 'National ID', 'Selfie Photo', 'Date of birth']);
  });
});

describe('personalDetailsOf shows the client only what they answered here', () => {
  /*
   * An older review screen copied every custom step's answers into the profile
   * under their builder keys, so the client read "Custom field 1790263652846"
   * — and "[object Object]" — beside their own name.
   */
  it('leaves out debris and copies of another step’s answers', () => {
    const steps = [
      { slug: 'personal', fields: [{ name: 'firstName', label: 'First name' }] },
      {
        slug: 'source-of-funds',
        fields: [{ name: 'customField_1790263641710', label: 'Employer' }],
      },
    ];
    const rows = personalDetailsOf(
      {
        firstName: 'Jane',
        __docChoice__document: 'passport',
        customField_1790263641710: 'Acme',
        customField_1790263652846: '[object Object]',
        customField_1790263668262: 'kept',
      },
      steps,
    );
    expect(rows).toEqual([
      { key: 'firstName', label: 'First name', value: 'Jane' },
      { key: 'customField_1790263668262', label: 'Earlier question', value: 'kept' },
    ]);
  });
});
