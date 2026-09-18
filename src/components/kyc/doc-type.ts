/**
 * The label an operator configures ↔ the value the API stores.
 *
 * The KYC builder holds document types as human labels — "National ID" — because
 * that is what the client reads on the form and what an operator types when
 * adding a new one. `kyc_submissions.document.docType` has always held
 * `national_id`, and `kyc.service.ts` still reads exactly that.
 *
 * So one of the two has to convert, and it is this: slugging a label is total
 * and stable, while asking operators to type snake_case in a client-facing
 * field would leak storage detail into the UI. Every submission written before
 * document types became configurable keeps reading correctly.
 */
export function docTypeSlug(label: string | undefined): string {
  if (!label) return '';
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * The upload key for one part of one document field.
 *
 * Namespaced by the FIELD rather than bare, because `front` and `back` are the
 * natural part keys for both an identity document and a proof of address — two
 * steps in the same flow would otherwise share an upload slot, and confirming
 * the utility bill would mark the passport as uploaded.
 *
 * Kept stable and derivable from config alone, so nothing has to store a
 * mapping: the same field and part always produce the same key.
 */
export function uploadSlotName(fieldName: string, partKey: string): string {
  return `${fieldName}__${partKey}`;
}

/**
 * The first required upload the client still owes, or `null` when the step is
 * complete.
 *
 * The rule is one sentence: every part of the CHOSEN document that is marked
 * required must have been uploaded. It replaced three hard-coded checks naming
 * `doc_front`, `doc_back` and `address_proof`, which demanded a back side for
 * every non-passport and a second page for every proof of address — so a
 * utility bill could not be submitted without a page it does not have.
 *
 * Returns the missing part rather than a boolean so the caller can name it:
 * "Please upload: Back Side" beats "please complete this step".
 */
export function missingRequiredParts(
  step: { slug: string; fields: KycFieldLike[] } | undefined,
  formData: Record<string, string>,
  uploaded: Record<string, boolean>,
): { slot: string; label: string } | null {
  if (!step) return null;

  const chosenName = formData[documentChoiceKey(step.slug)];
  // Nothing chosen yet: the picker itself is what asks for that, and naming a
  // slot the client cannot see would be a worse message.
  if (!chosenName) return null;

  const field = step.fields.find((f) => f.name === chosenName);
  const parts = field?.document?.parts ?? [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (!part.required) continue;
    /*
     * Checked against the API field, because that is the key `uploadsState` is
     * populated under — both by a fresh upload and by the saved paths reloaded
     * from `/kyc/status`.
     */
    const slot =
      apiUploadField(field!.name, index, field!.document?.category) ??
      uploadSlotName(field!.name, part.key);
    if (!uploaded[slot]) return { slot, label: part.label };
  }
  return null;
}

/** The shape this module needs off a field — structural, so both apps' generated types fit. */
/** The shape this module needs off a field — structural, so generated types fit. */
interface KycFieldLike {
  name: string;
  type?: string;
  document?: { value: string; label: string; category?: string; parts: KycPartLike[] };
}

interface KycPartLike {
  key: string;
  label: string;
  required: boolean;
}

/**
 * The API field a config-driven slot uploads into.
 *
 * ## Why a translation instead of new storage
 *
 * `kyc.service.ts` maps four literal field names onto typed columns:
 * `doc_front` → `document.frontFilePath`, `doc_back` → `document.backFilePath`,
 * `address_proof` → `addressProof.filePath`, `address_proof_2` →
 * `addressProof.page2FilePath`. The admin review screen, the rejected-field
 * list and every stored submission read those columns.
 *
 * Config slots are named `<field>__<part>` so two steps cannot collide. Making
 * the API accept those names directly would mean either a new storage shape —
 * orphaning every document already uploaded — or a column per part, which is
 * the fixed-pair modelling this whole change removes.
 *
 * Keyed on POSITION rather than on the part key, because the columns are
 * positional too — `frontFilePath` is simply the first file of the step. A
 * config calling its parts `photo_page` and `barcode` still lands correctly.
 *
 * So the slot is translated on the way out. The client renders whatever parts
 * the config declares; the first upload of a step lands in the primary column
 * and the second in the secondary, which is what those columns have always
 * meant. A type with a THIRD part has nowhere to go — see the note in the
 * return below, and that is a backend change to make deliberately rather than
 * to fake here.
 */
export function apiUploadField(
  fieldName: string,
  partIndex: number,
  category?: string,
): string | null {
  /*
   * Keyed on the document's CATEGORY, with the field name only as a fallback.
   * It used to sniff for "address" in the name, which broke the moment a field
   * was called `utilityBill` — the category is the fact, the name is whatever
   * the operator typed.
   */
  const isAddress = category ? category === 'address' : fieldName.toLowerCase().includes('address');

  if (isAddress) {
    if (partIndex === 0) return 'address_proof';
    if (partIndex === 1) return 'address_proof_2';
    return null;
  }

  if (partIndex === 0) return 'doc_front';
  if (partIndex === 1) return 'doc_back';
  /*
   * A third part has no column. Returning null rather than guessing means the
   * caller refuses the upload and says so, instead of silently overwriting the
   * back side with a barcode photo. Adding a third slot is a backend migration.
   */
  return null;
}

/**
 * The document the client picked for a given category, as the value the API
 * stores (`passport`, `utility_bill`).
 *
 * Read through the CONFIG: the step records which of its document fields was
 * chosen, and that field's type says which document it collects. Nothing here
 * knows a document name.
 */
export function chosenDocumentValue(
  steps: { slug: string; fields: KycFieldLike[] }[],
  formData: Record<string, string>,
  category: 'identity' | 'address',
): string {
  for (const step of steps) {
    const chosenName = formData[documentChoiceKey(step.slug)];
    if (!chosenName) continue;
    const field = step.fields.find((f) => f.name === chosenName);
    if (field?.document?.category === category) return field.document.value;
  }
  return '';
}

/**
 * Where a step records WHICH of its document fields the client picked.
 *
 * Keyed on the step, not on a field: the choice belongs to the step — "this is
 * how I am proving my identity" — and storing it inside one field's own slot
 * would conflate "chosen" with "this field's answer", so selecting Passport
 * would look like answering the National ID field.
 *
 * Prefixed so it cannot collide with a configured field name.
 */
export function documentChoiceKey(stepSlug: string): string {
  return `__docChoice__${stepSlug}`;
}

/**
 * A field whose answer is an UPLOADED FILE rather than something typed.
 *
 * Mirrors `isFileField` in the backend's `step-slugs.ts`, and the two must stay
 * in step: this decides what the wizard demands before Continue, that decides
 * what `submit` demands before a submission is accepted. If they disagree the
 * client is either blocked by a rule the server does not have, or waved past
 * one it does.
 *
 * `doc:*` counts because every catalogue document is collected as a file.
 */
export function isUploadField(field: { type?: string }): boolean {
  const type = field.type ?? '';
  return type === 'file' || type === 'camera' || type.startsWith('doc:');
}

/**
 * The half of `/kyc/status` these two helpers read. `null` is a real value —
 * react-query hands back `null` before the first response — so it is in the
 * type rather than asserted away at each call site.
 */
type StatusLike =
  { document?: { docType?: string }; addressProof?: { docType?: string } } | null | undefined;

/**
 * Which document the SERVER holds a file for, per category.
 *
 * Every identity document's first page is stored in one column — `doc_front` —
 * so "is that column filled?" cannot answer "has the client uploaded THIS
 * document?". Reading it as though it could meant that after a passport was
 * uploaded, switching the picker to National ID showed its slot as already
 * satisfied, and the client submitted a passport as their national ID.
 */
export function storedDocValuesOf(status: StatusLike): { identity?: string; address?: string } {
  return { identity: status?.document?.docType, address: status?.addressProof?.docType };
}

/**
 * The picker choice each step should start on, rebuilt from what was saved.
 *
 * Matched on the document's CATEGORY and VALUE rather than a hard-coded name: a
 * stored `passport` selects whichever field collects `doc:passport`, whatever
 * the operator called it. A returning client seeing an empty picker above their
 * own uploaded document is how they end up re-picking and re-uploading it.
 */
export function savedDocumentChoices(
  status: StatusLike,
  steps: { slug: string; fields: KycFieldLike[] }[],
): Record<string, string> {
  const choices: Record<string, string> = {};
  const stored: [string | undefined, 'identity' | 'address'][] = [
    [status?.document?.docType, 'identity'],
    [status?.addressProof?.docType, 'address'],
  ];
  for (const [value, category] of stored) {
    if (!value) continue;
    for (const step of steps) {
      const field = step.fields.find(
        (f) => f.document?.value === value && f.document.category === category,
      );
      if (field) choices[documentChoiceKey(step.slug)] = field.name;
    }
  }
  return choices;
}
