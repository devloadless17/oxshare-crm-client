import { describe, expect, it } from 'vitest';
import {
  effectiveUploads,
  flagsSettledByUpload,
  outstandingFlags,
  storedFilesOf,
} from './upload-state';

/**
 * Which uploads count as DONE on the step in front of the client.
 *
 * Reported from production: a passport shown as uploaded for the national ID
 * and the driving licence (every identity document shares one column), and a
 * document the reviewer returned still showing green.
 */

const STEPS = [
  {
    slug: 'document',
    fields: [
      { name: 'passport', type: 'doc:passport' },
      { name: 'nationalId', type: 'doc:national_id' },
    ],
  },
  { slug: 'selfie', fields: [{ name: 'selfie', type: 'camera' }] },
  { slug: 'source-of-funds', fields: [{ name: 'payslip', type: 'file' }] },
];

const PASSPORT_ON_FILE = storedFilesOf({
  document: { docType: 'passport', frontFilePath: 'uploads/kyc/p.jpg' },
  selfie: { filePath: 'uploads/kyc/s.jpg' },
  stepData: { 'source-of-funds': { payslip: { filePath: 'uploads/kyc/pay.jpg' }, note: 'x' } },
});

const base = {
  stored: PASSPORT_ON_FILE,
  storedTypes: { identity: 'passport' },
  session: {},
  outstanding: [],
  steps: STEPS,
};

describe('a page counts for the document it was uploaded FOR', () => {
  it('counts the stored passport while Passport is chosen', () => {
    expect(effectiveUploads({ ...base, chosen: { identity: 'passport' } }).doc_front).toBe(true);
  });

  it('does NOT count it for the national ID — the reported bug', () => {
    expect(effectiveUploads({ ...base, chosen: { identity: 'national_id' } }).doc_front).toBe(
      false,
    );
  });

  it('counts a page this session uploaded for the chosen document', () => {
    const done = effectiveUploads({
      ...base,
      chosen: { identity: 'national_id' },
      session: { doc_front: { docType: 'national_id' } },
    });
    expect(done.doc_front).toBe(true);
  });

  it('counts nothing on a document step with no choice made', () => {
    expect(effectiveUploads({ ...base, chosen: {} }).doc_front).toBeUndefined();
  });
});

describe('a returned file does not count until it is replaced', () => {
  it('a flagged page', () => {
    const done = effectiveUploads({
      ...base,
      chosen: { identity: 'passport' },
      outstanding: ['doc_front'],
    });
    expect(done.doc_front).toBe(false);
  });

  it('a whole-document flag', () => {
    const done = effectiveUploads({
      ...base,
      chosen: { identity: 'passport' },
      outstanding: ['passport'],
    });
    expect(done.doc_front).toBe(false);
  });

  it('the selfie and a custom step’s file', () => {
    const done = effectiveUploads({
      ...base,
      chosen: {},
      outstanding: ['selfie', 'payslip'],
    });
    expect(done.selfie).toBe(false);
    expect(done.payslip).toBe(false);
  });

  it('counts again once uploaded this session', () => {
    const done = effectiveUploads({
      ...base,
      chosen: {},
      outstanding: ['selfie'],
      session: { selfie: {} },
    });
    expect(done.selfie).toBe(true);
  });
});

describe('the flags an upload settles', () => {
  it('a page settles itself and a whole-document flag on its step', () => {
    expect(flagsSettledByUpload('doc_back', STEPS)).toEqual(['doc_back', 'passport', 'nationalId']);
  });

  it('a custom file is its own flag', () => {
    expect(flagsSettledByUpload('payslip', STEPS)).toEqual(['payslip']);
  });
});

describe('outstanding flags', () => {
  it('keeps a typed field red until its value changes', () => {
    const stored = { dateOfBirth: '1990-01-01' };
    expect(outstandingFlags(['dateOfBirth'], [], { dateOfBirth: '1990-01-01' }, stored)).toEqual([
      'dateOfBirth',
    ]);
    expect(outstandingFlags(['dateOfBirth'], [], { dateOfBirth: '1991-01-01' }, stored)).toEqual(
      [],
    );
  });

  it('drops a document flag once settled by an upload', () => {
    expect(outstandingFlags(['doc_front', 'selfie'], ['doc_front'], {}, {})).toEqual(['selfie']);
  });
});

describe('storedFilesOf', () => {
  it('reads the four columns and a custom step’s files, and no typed answer', () => {
    expect(PASSPORT_ON_FILE).toEqual({
      doc_front: 'uploads/kyc/p.jpg',
      selfie: 'uploads/kyc/s.jpg',
      payslip: 'uploads/kyc/pay.jpg',
    });
  });
});
