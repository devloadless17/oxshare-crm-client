import { describe, expect, it } from 'vitest';
import { savedDocumentChoices, storedDocValuesOf, uploadFieldFor } from './doc-type';

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

describe('uploadFieldFor — where a document field on a given step is stored', () => {
  /*
   * Reported from production: "a Live Camera or File Upload on a custom step
   * overrides the files from the steps before it."
   *
   * `apiUploadField` translates a config slot onto the canonical columns, which
   * is correct for `document` and `address` — those columns exist to hold their
   * files — and it was applied on EVERY step. So a document field on a step the
   * broker added uploaded straight over the client's passport or proof of
   * address. Worse than a display bug: the reviewer then checks a document the
   * client never submitted as their ID, and the original is gone.
   */
  it('keeps the canonical columns for the document step', () => {
    expect(uploadFieldFor('document', 'passportField', 0, 'identity')).toBe('doc_front');
    expect(uploadFieldFor('document', 'idField', 1, 'identity')).toBe('doc_back');
  });

  it('keeps them for the address step too', () => {
    expect(uploadFieldFor('address', 'billField', 0, 'address')).toBe('address_proof');
    expect(uploadFieldFor('address', 'billField', 1, 'address')).toBe('address_proof_2');
  });

  it('NEVER writes a custom step into a canonical column', () => {
    /*
     * The assertion the fix exists for. Whatever the field is called and
     * whatever category it collects, a custom step must not land on the four
     * shared columns.
     */
    const CANONICAL = ['doc_front', 'doc_back', 'address_proof', 'address_proof_2'];
    for (const category of ['identity', 'address', undefined]) {
      for (const partIndex of [0, 1, 2]) {
        const slot = uploadFieldFor('extra-docs', 'customField_123', partIndex, category);
        expect(
          CANONICAL,
          `part ${partIndex} of a ${category ?? 'typeless'} field escaped`,
        ).not.toContain(slot);
      }
    }
  });

  it("stores a custom step's document under the field's own key", () => {
    expect(uploadFieldFor('extra-docs', 'customField_123', 0, 'identity')).toBe('customField_123');
  });

  it('gives a custom field the SAME key for every part, unlike a canonical step', () => {
    /*
     * Deliberate, and worth pinning: `step_data` holds one file per field, so a
     * multi-part document on a custom step stores its latest page. A canonical
     * step has two columns and uses both. Stating it here means the next person
     * meets the limit as a decision rather than as a surprise.
     */
    expect(uploadFieldFor('extra-docs', 'customField_123', 1, 'identity')).toBe('customField_123');
  });

  it('still refuses a THIRD part on a canonical step, which has nowhere to put it', () => {
    expect(uploadFieldFor('document', 'passportField', 2, 'identity')).toBeNull();
  });
});
