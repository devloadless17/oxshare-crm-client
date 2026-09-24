import { isUploadField } from './doc-type';

/**
 * Which upload slots count as DONE on the step in front of the client — a pure
 * module, so every rule here is an assertion rather than something found by
 * clicking through the wizard.
 *
 * ## Three bugs, reported from production, one cause each
 *
 *  1. **A passport shown as uploaded for the national ID and the driving
 *     licence.** Every identity document stores its first page in one column,
 *     and "is that column filled?" was read as "is THIS document uploaded?". A
 *     slot now counts only for the document it was uploaded FOR: this session's
 *     uploads carry their type, and a stored file counts when the stored type is
 *     the chosen one.
 *  2. **A returned document still read as uploaded.** The reviewer's flag drew
 *     nothing on a document, and its tile kept its green state. A flagged file
 *     no longer counts until it is replaced.
 *  3. **The session and the server disagreed.** Uploads were remembered in
 *     sessionStorage by column, so a page of an abandoned document kept counting
 *     after the server had started the document afresh. The server's answer is
 *     read each time now; the session only adds what it uploaded since.
 */

/** The half of `/kyc/status` read here — structural, so the generated DTO fits. */
export interface StatusFiles {
  document?: { docType?: string; frontFilePath?: string; backFilePath?: string };
  selfie?: { filePath?: string };
  addressProof?: { docType?: string; filePath?: string; page2FilePath?: string };
  stepData?: Record<string, Record<string, unknown>>;
  rejectedFields?: string[];
}

/** A slot this session uploaded, and the document it was uploaded for (canonical slots). */
export type SessionUploads = Record<string, { docType?: string }>;

interface StepLike {
  slug: string;
  fields: { name: string; type?: string }[];
}

const IDENTITY_SLOTS = ['doc_front', 'doc_back'];
const ADDRESS_SLOTS = ['address_proof', 'address_proof_2'];

function isStoredFile(value: unknown): value is { filePath: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { filePath?: unknown }).filePath === 'string' &&
    (value as { filePath: string }).filePath !== ''
  );
}

/** Every slot the server holds a file in, with the file's stored path. */
export function storedFilesOf(status: StatusFiles | null | undefined): Record<string, string> {
  const files: Record<string, string> = {};
  const put = (slot: string, path: string | undefined) => {
    if (path) files[slot] = path;
  };
  put('doc_front', status?.document?.frontFilePath);
  put('doc_back', status?.document?.backFilePath);
  put('selfie', status?.selfie?.filePath);
  put('address_proof', status?.addressProof?.filePath);
  put('address_proof_2', status?.addressProof?.page2FilePath);
  for (const answers of Object.values(status?.stepData ?? {})) {
    for (const [name, value] of Object.entries(answers ?? {})) {
      if (isStoredFile(value)) files[name] = value.filePath;
    }
  }
  return files;
}

/**
 * The flags an upload into `slot` settles — the portal's copy of the backend's
 * `flagsSettledByUpload`, so the tile stops being red the moment the new file
 * lands rather than on the next visit.
 */
export function flagsSettledByUpload(slot: string, steps: readonly StepLike[]): string[] {
  const owner = IDENTITY_SLOTS.includes(slot)
    ? 'document'
    : ADDRESS_SLOTS.includes(slot)
      ? 'address'
      : slot === 'selfie'
        ? 'selfie'
        : undefined;
  if (!owner) return [slot];
  const wholeDocuments = steps
    .filter((step) => step.slug === owner)
    .flatMap((step) => step.fields.filter(isUploadField).map((f) => f.name));
  return [slot, ...wholeDocuments];
}

/**
 * The reviewer's flags the client has not answered yet.
 *
 * A document flag stands until the slot is uploaded again (`settled`). A typed
 * field's flag stands while the field still holds the value the reviewer
 * returned — change it and it stops being red, as the server will agree once
 * the step is saved.
 */
export function outstandingFlags(
  rejected: readonly string[] | undefined,
  settled: readonly string[],
  formData: Record<string, string>,
  storedAnswers: Record<string, string>,
): string[] {
  return (rejected ?? []).filter((id) => {
    if (settled.includes(id)) return false;
    if (id in storedAnswers && id in formData) return formData[id] === storedAnswers[id];
    return true;
  });
}

/**
 * The uploads a step should treat as done.
 *
 * `chosen` is the document picked on each canonical step. A canonical slot is
 * done when THIS session uploaded it for that document, or the server holds it
 * under that document's type and nothing flags it. Anything else — a selfie, a
 * custom step's file — is done when uploaded this session, or held by the
 * server and not flagged.
 */
export function effectiveUploads(input: {
  stored: Record<string, string>;
  storedTypes: { identity?: string; address?: string };
  session: SessionUploads;
  chosen: { identity?: string; address?: string };
  outstanding: readonly string[];
  steps: readonly StepLike[];
}): Record<string, boolean> {
  const { stored, storedTypes, session, chosen, outstanding, steps } = input;
  const flagged = (slot: string) =>
    flagsSettledByUpload(slot, steps).some((id) => outstanding.includes(id));

  const done: Record<string, boolean> = {};
  const slots = new Set([...Object.keys(stored), ...Object.keys(session)]);
  for (const slot of slots) {
    const category = IDENTITY_SLOTS.includes(slot)
      ? 'identity'
      : ADDRESS_SLOTS.includes(slot)
        ? 'address'
        : undefined;
    if (category) {
      const want = chosen[category];
      if (!want) continue;
      done[slot] =
        session[slot]?.docType === want ||
        (Boolean(stored[slot]) && storedTypes[category] === want && !flagged(slot));
    } else {
      done[slot] = Boolean(session[slot]) || (Boolean(stored[slot]) && !flagged(slot));
    }
  }
  return done;
}

/**
 * Did the reviewer return THIS page of THIS document?
 *
 * ## Reported from local testing: every identity card turned red
 *
 * A canonical page flag (`doc_front`) names a SLOT, and every identity document
 * stores its first page in that one slot — so reading the flag against the
 * CHOSEN card made National ID and Driving Licence red the moment the client
 * clicked them, after only a passport had been returned. A canonical page flag
 * belongs to the document the server HOLDS (`storedTypes`), whichever card is
 * selected. A flag naming a document itself (`passport`), or a file field on a
 * step the broker added, is specific already.
 */
export function isPageReturned(input: {
  slot: string;
  fieldName: string;
  docValue?: string;
  category?: string;
  storedTypes: { identity?: string; address?: string };
  outstanding: readonly string[];
}): boolean {
  const { slot, fieldName, docValue, category, storedTypes, outstanding } = input;
  if (outstanding.includes(fieldName)) return true;
  if (!outstanding.includes(slot)) return false;
  const canonical = IDENTITY_SLOTS.includes(slot) || ADDRESS_SLOTS.includes(slot);
  if (!canonical) return true;
  const held = category === 'address' ? storedTypes.address : storedTypes.identity;
  return docValue !== undefined && docValue === held;
}
