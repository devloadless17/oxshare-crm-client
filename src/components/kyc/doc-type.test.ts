import { describe, expect, it } from 'vitest';
import { savedDocumentChoices, storedDocValuesOf } from './doc-type';

/**
 * ONE COLUMN, THREE DOCUMENTS — and why the picker has to know which.
 *
 * `apiUploadField` maps the first page of EVERY identity document onto the same
 * storage field, `doc_front`. That is deliberate (see its note), and it means
 * "is `doc_front` filled?" cannot answer "has the client uploaded THIS
 * document?".
 *
 * The renderer used to treat it as if it could: `uploaded={slot || doc_front}`.
 * So a client who uploaded a passport and then opened National ID or Driving
 * Licence saw the slot already satisfied — reported from production as the file
 * showing up under all three — pressed Continue, and submitted a passport as
 * their national ID.
 */

const STEPS = [
  {
    slug: 'document',
    fields: [
      {
        name: 'passportField',
        document: { value: 'passport', label: 'Passport', category: 'identity', parts: [] },
      },
      {
        name: 'idField',
        document: { value: 'national_id', label: 'National ID', category: 'identity', parts: [] },
      },
    ],
  },
  {
    slug: 'address',
    fields: [
      {
        name: 'billField',
        document: { value: 'utility_bill', label: 'Utility Bill', category: 'address', parts: [] },
      },
    ],
  },
];

describe('storedDocValuesOf', () => {
  it('reports the document the server actually holds, per category', () => {
    expect(
      storedDocValuesOf({
        document: { docType: 'passport' },
        addressProof: { docType: 'utility_bill' },
      }),
    ).toEqual({ identity: 'passport', address: 'utility_bill' });
  });

  it('is safe before the first response, when the status is null', () => {
    expect(storedDocValuesOf(null)).toEqual({ identity: undefined, address: undefined });
    expect(storedDocValuesOf(undefined)).toEqual({ identity: undefined, address: undefined });
  });

  it('distinguishes the stored document from the others sharing its column', () => {
    /*
     * The assertion the fix rests on. A passport on file must not read as a
     * national ID on file, even though both are stored in `doc_front`.
     */
    const stored = storedDocValuesOf({ document: { docType: 'passport' } });
    expect(stored.identity).toBe('passport');
    expect(stored.identity).not.toBe('national_id');
  });
});

describe('savedDocumentChoices', () => {
  it('re-selects the field that collects the stored document', () => {
    expect(savedDocumentChoices({ document: { docType: 'national_id' } }, STEPS)).toEqual({
      __docChoice__document: 'idField',
    });
  });

  it('matches on CATEGORY, so an address document cannot select an identity field', () => {
    const choices = savedDocumentChoices({ addressProof: { docType: 'utility_bill' } }, STEPS);
    expect(choices).toEqual({ __docChoice__address: 'billField' });
  });

  it('chooses nothing when nothing was stored', () => {
    expect(savedDocumentChoices(undefined, STEPS)).toEqual({});
    expect(savedDocumentChoices({}, STEPS)).toEqual({});
  });

  it('chooses nothing for a stored document no configured field collects', () => {
    // The broker removed Driving Licence after a client picked it. Selecting
    // nothing is right; selecting a different document would be a lie.
    expect(savedDocumentChoices({ document: { docType: 'driving_license' } }, STEPS)).toEqual({});
  });
});
