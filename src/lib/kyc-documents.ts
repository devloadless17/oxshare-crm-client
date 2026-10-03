/**
 * The documents a client's KYC submission carries, as rows the client can read.
 *
 * ## Why this exists
 *
 * A returned submission told the client THAT it was rejected and which field
 * ids to fix, and nothing about what they had actually sent. So "doc_back" in
 * the fixing list pointed at a file they could no longer see, and the only way
 * to find out what the reviewer had looked at was to guess and upload again.
 * The outcome screen and the profile now list every stored file with its own
 * state, derived here once so the two cannot disagree.
 *
 * Mirrors `documentsOf` in the admin review screen (same four canonical columns,
 * same drop-the-empty-slots rule), extended with the files a CUSTOM step stores
 * in `stepData` — the reviewer's list predates those and a client should still
 * see what they uploaded there.
 *
 * Labels come from the CONFIG wherever it names the document, so a broker who
 * calls the passport "Travel document" is quoted back to the client in their
 * words, not ours.
 */

import { t } from '@/lib/i18n';
import { answerText, docLabel, fieldLabel, stepTitle } from '@/lib/kyc-text';
import type { KycStatus } from '@/lib/kyc-form-access';

/** The document's own state, derived from the submission's. */
export type KycDocumentState = 'approved' | 'rejected' | 'accepted' | 'in_review' | 'not_submitted';

export interface KycDocumentRow {
  /** Stable React key; unique per row. */
  key: string;
  filePath: string;
  /**
   * What the document is: "Passport", "Selfie", "Utility bill". Never the name
   * the file had on the client's device — the API does not keep it (0160, D-84).
   */
  type: string;
  /** Which page of it, when the document has more than one. */
  part?: string;
  /**
   * The ids a reviewer might put in `rejectedFields` to mean THIS file.
   *
   * More than one, because both vocabularies are live: the storage names
   * (`doc_front`) from the seeded fallback list, and the config field names
   * (`passport`) the reject dialog now derives from the builder.
   */
  fieldKeys: string[];
}

/** Structural, so the generated DTO types fit without importing them here. */
interface FieldLike {
  name: string;
  label: string;
  labelAr?: string | null;
  type?: string;
  options?: string[] | null;
  optionsAr?: Record<string, string> | null;
  document?: {
    value: string;
    label: string;
    labelAr?: string | null;
    category?: string;
    parts: { key: string; label: string; labelAr?: string | null }[];
  };
}

interface StepLike {
  slug: string;
  title?: string;
  titleAr?: string | null;
  fields: FieldLike[];
}

type StoredFile = { filePath?: string };

export interface KycStatusLike {
  status: KycStatus;
  document?: {
    docType?: string;
    frontFilePath?: string;
    backFilePath?: string;
  };
  selfie?: StoredFile;
  addressProof?: StoredFile & {
    docType?: string;
    page2FilePath?: string;
  };
  stepData?: Record<string, Record<string, unknown>>;
  rejectedFields?: string[];
}

const CANONICAL_SLUGS = new Set(['personal', 'document', 'selfie', 'address']);

/** `utility_bill` / `dateOfBirth` → `Utility bill` / `Date of birth`, for a key the config no longer names. */
/** A document part's label in the reader's language, or `undefined` when there is no such part. */
function partLabel(
  part: { label: string; labelAr?: string | null } | undefined,
): string | undefined {
  return part ? docLabel(part) : undefined;
}

function humanise(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A key no configured field names. The builder generates `customField_<timestamp>`
 * and never shows it, so that shape means a question since removed from the form.
 */
function unconfiguredLabel(key: string): string {
  return /^customField_\d+$/.test(key) ? t('kyc.docs.retiredQuestion') : humanise(key);
}

function isStoredFile(value: unknown): value is { filePath: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { filePath?: unknown }).filePath === 'string' &&
    (value as { filePath: string }).filePath !== ''
  );
}

/**
 * The config fields that collect the stored document of a category — matched
 * on the document's VALUE, since every identity document shares one column and
 * only `docType` says which of them the file is.
 */
function fieldsFor(steps: StepLike[], category: 'identity' | 'address', value?: string) {
  return steps
    .flatMap((s) => s.fields)
    .filter((f) => f.document?.category === category && (!value || f.document.value === value));
}

export function kycDocumentsOf(
  status: KycStatusLike | null | undefined,
  steps: StepLike[] = [],
): KycDocumentRow[] {
  if (!status) return [];
  const rows: (Omit<KycDocumentRow, 'filePath'> & { filePath?: string })[] = [];

  // ── Identity: one or two pages, both under `document` ─────────────────────
  const idType = status.document?.docType;
  const idFields = fieldsFor(steps, 'identity', idType);
  const idDoc = idFields[0]?.document;
  const idLabel = idFields[0]
    ? fieldLabel(idFields[0])
    : idType
      ? humanise(idType)
      : t('kyc.idDocument');
  const idNames = idFields.map((f) => f.name);
  const idHasBack = !!status.document?.backFilePath;
  rows.push(
    {
      key: 'doc_front',
      filePath: status.document?.frontFilePath,
      type: idLabel,
      // A one-page document has no "front" worth naming.
      part: idHasBack ? (partLabel(idDoc?.parts[0]) ?? t('kyc.docs.front')) : undefined,
      fieldKeys: ['doc_front', ...idNames],
    },
    {
      key: 'doc_back',
      filePath: status.document?.backFilePath,
      type: idLabel,
      part: partLabel(idDoc?.parts[1]) ?? t('kyc.docs.back'),
      fieldKeys: ['doc_back', ...idNames],
    },
  );

  // ── Selfie ────────────────────────────────────────────────────────────────
  const selfieNames = steps
    .filter((s) => s.slug === 'selfie')
    .flatMap((s) => s.fields.map((f) => f.name));
  rows.push({
    key: 'selfie',
    filePath: status.selfie?.filePath,
    type: t('kyc.selfiePhoto'),
    fieldKeys: ['selfie', ...selfieNames],
  });

  // ── Proof of address: one or two pages ────────────────────────────────────
  const addrType = status.addressProof?.docType;
  const addrFields = fieldsFor(steps, 'address', addrType);
  const addrDoc = addrFields[0]?.document;
  const addrLabel = addrFields[0]
    ? fieldLabel(addrFields[0])
    : addrType
      ? humanise(addrType)
      : t('kyc.proofOfAddress');
  const addrNames = addrFields.map((f) => f.name);
  const addrHasPage2 = !!status.addressProof?.page2FilePath;
  rows.push(
    {
      key: 'address_proof',
      filePath: status.addressProof?.filePath,
      type: addrLabel,
      part: addrHasPage2
        ? (partLabel(addrDoc?.parts[0]) ?? t('kyc.docs.page', { n: 1 }))
        : undefined,
      fieldKeys: ['address_proof', ...addrNames],
    },
    {
      key: 'address_proof_2',
      filePath: status.addressProof?.page2FilePath,
      type: addrLabel,
      part: partLabel(addrDoc?.parts[1]) ?? t('kyc.docs.page', { n: 2 }),
      fieldKeys: ['address_proof_2', ...addrNames],
    },
  );

  // ── Files a custom step stored under its own slug ─────────────────────────
  for (const [slug, answers] of Object.entries(status.stepData ?? {})) {
    if (CANONICAL_SLUGS.has(slug) || !answers) continue;
    const step = steps.find((s) => s.slug === slug);
    for (const [name, value] of Object.entries(answers)) {
      if (!isStoredFile(value)) continue;
      const field = step?.fields.find((f) => f.name === name);
      rows.push({
        key: `${slug}:${name}`,
        filePath: value.filePath,
        type: field ? fieldLabel(field) : unconfiguredLabel(name),
        part: step?.title ? stepTitle(step) : undefined,
        fieldKeys: [name],
      });
    }
  }

  return rows.filter((r): r is KycDocumentRow => typeof r.filePath === 'string' && !!r.filePath);
}

/**
 * One document's state, read off the submission's.
 *
 * A submission is decided as a whole, so most states pass straight through.
 * The exception is a rejection that NAMED fields: the reviewer asked for those
 * files again, and everything else on the list is not what was wrong — calling
 * it "rejected" would send the client to replace documents nobody objected to.
 * A rejection naming nothing returns the whole submission, so every file is.
 */
export function kycDocumentState(
  row: KycDocumentRow,
  status: KycStatus,
  rejectedFields: string[] = [],
): KycDocumentState {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      if (rejectedFields.length === 0) return 'rejected';
      return row.fieldKeys.some((k) => rejectedFields.includes(k)) ? 'rejected' : 'accepted';
    case 'submitted':
    case 'under_review':
      return 'in_review';
    default:
      return 'not_submitted';
  }
}

/**
 * The personal answers worth showing back, labelled from the config.
 *
 * Configured fields first, in the order the form asked them; anything stored
 * that the config no longer names follows, so an answer is never hidden just
 * because a broker renamed the field after the client gave it.
 *
 * NOT shown: internal keys (`__docChoice__…`), empty values, a file record
 * stringified to "[object Object]", and any key another step's configuration
 * names. An older review screen re-posted the whole wizard form as the personal
 * step, so a custom step's answers were COPIED here under their builder keys —
 * and the client read "Custom field 1790263652846" beside their own name. Those
 * answers belong to their step; a field no step names any more is labelled in
 * words rather than by its generated key.
 */
export function personalDetailsOf(
  personalInfo: Record<string, unknown> | null | undefined,
  steps: StepLike[] = [],
): { key: string; label: string; value: string }[] {
  if (!personalInfo) return [];
  const configured = steps.find((s) => s.slug === 'personal')?.fields ?? [];
  const elsewhere = new Set(
    steps.filter((s) => s.slug !== 'personal').flatMap((s) => s.fields.map((f) => f.name)),
  );
  const text = (v: unknown) =>
    (typeof v === 'string' && v !== '[object Object]') || typeof v === 'number' ? String(v) : '';

  const seen = new Set<string>();
  const out: { key: string; label: string; value: string }[] = [];
  for (const field of configured) {
    seen.add(field.name);
    const value = text(personalInfo[field.name]).trim();
    // The label and a choice's answer read in the reader's language.
    if (value)
      out.push({ key: field.name, label: fieldLabel(field), value: answerText(field, value) });
  }
  for (const [key, raw] of Object.entries(personalInfo)) {
    if (seen.has(key) || elsewhere.has(key) || key.startsWith('__')) continue;
    const value = text(raw).trim();
    if (!value) continue;
    out.push({ key, label: unconfiguredLabel(key), value });
  }
  return out;
}

/**
 * `rejectedFields` as the client should read it.
 *
 * The ids are storage and config names (`doc_back`, `nationalId`, `dateOfBirth`)
 * and were rendered raw, so a returned client read "doc_back" and had to guess.
 * A page id names that page ("National ID · Back"); a document's own field name
 * covers every page of it and names the document alone; anything else takes its
 * configured label, then a humanised key.
 */
export function rejectedFieldLabels(
  ids: string[],
  status: KycStatusLike | null | undefined,
  steps: StepLike[] = [],
): string[] {
  const rows = kycDocumentsOf(status, steps);
  const fields = steps.flatMap((s) => s.fields);
  const labels = ids.map((id) => {
    const matched = rows.filter((r) => r.fieldKeys.includes(id));
    if (matched.length === 1) {
      const [row] = matched;
      return row!.part ? `${row!.type} · ${row!.part}` : row!.type;
    }
    if (matched.length > 1) return matched[0]!.type;
    const field = fields.find((f) => f.name === id);
    return field ? fieldLabel(field) : unconfiguredLabel(id);
  });
  return [...new Set(labels)];
}
