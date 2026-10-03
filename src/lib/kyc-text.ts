import { currentLocale, localized } from '@/lib/i18n';

/**
 * The KYC configuration's words in the reader's language.
 *
 * `GET /kyc/config` serves every operator-authored text with an optional Arabic
 * twin (`titleAr`, `labelAr`, `hintAr`, `optionsAr`…), and the platform's own
 * parts (identity fields, the document catalogue) arrive the same way. Every
 * screen that PRINTS one of them goes through here, so the fallback rule is
 * written once: the Arabic when reading Arabic and it is not blank, else the
 * English — never an empty label.
 *
 * ⚠️ DISPLAY ONLY. An option's VALUE — what is submitted, stored and compared —
 * is always the English option. `optionLabel` maps a value to what a person
 * reads; nothing here may be used to build what is sent.
 */

type Text = string | null | undefined;

interface DocumentLike {
  label: string;
  labelAr?: Text;
}

interface FieldTextLike {
  label: string;
  labelAr?: Text;
  hint?: Text;
  hintAr?: Text;
  optionsAr?: Record<string, string> | null;
  document?: DocumentLike | null;
}

interface StepTextLike {
  title?: Text;
  titleAr?: Text;
  description?: Text;
  descriptionAr?: Text;
}

/** A field's question. A document field falls back to its catalogue Arabic when it kept the catalogue's English. */
export function fieldLabel(field: FieldTextLike): string {
  const docAr =
    field.document && field.document.label === field.label ? field.document.labelAr : undefined;
  return localized(field.label, field.labelAr ?? docAr);
}

/** A field's (or a document part's) hint; `undefined` when there is none in either language. */
export function fieldHint(field: { hint?: Text; hintAr?: Text }): string | undefined {
  const shown = localized(field.hint ?? '', field.hintAr);
  return shown === '' ? undefined : shown;
}

/** A document type's or part's own label. */
export function docLabel(doc: DocumentLike): string {
  return localized(doc.label, doc.labelAr);
}

/** A step's title. */
export function stepTitle(step: StepTextLike): string {
  return localized(step.title ?? '', step.titleAr);
}

/** A step's description; `undefined` when there is none. */
export function stepDescription(step: StepTextLike): string | undefined {
  const shown = localized(step.description ?? '', step.descriptionAr);
  return shown === '' ? undefined : shown;
}

/** What a person reads for one option VALUE (the stored English choice). */
export function optionLabel(
  field: { optionsAr?: Record<string, string> | null },
  value: string,
): string {
  return localized(value, field.optionsAr?.[value]);
}

/**
 * A stored answer as a person reads it: a choice shows its Arabic label, a
 * "tick all that apply" answer (comma-separated choices) shows each one's.
 * Anything else — a name, a date, a phone number — is returned unchanged.
 */
export function answerText(
  field: { type?: string; options?: string[] | null; optionsAr?: Record<string, string> | null },
  value: string,
): string {
  if (!field.optionsAr || !value) return value;
  if (field.type === 'checkbox' && field.options?.length) {
    return value
      .split(',')
      .map((choice) => choice.trim())
      .filter((choice) => choice !== '')
      .map((choice) => optionLabel(field, choice))
      .join(currentLocale() === 'ar' ? '، ' : ', ');
  }
  return optionLabel(field, value);
}

/** Field names whose options are the platform's alphabetical country/nationality lists. */
const DICTIONARY_FIELDS = new Set(['country', 'nationality']);

function isAlphabetical(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1]!.localeCompare(values[i]!) > 0) return false;
  }
  return true;
}

/**
 * Options in the order a reader can scan. The country and nationality lists
 * (and any long list the broker kept alphabetical) are in ENGLISH dictionary
 * order; read in Arabic that order is random, so they are re-sorted by the
 * label shown. A broker's own short list keeps the order they chose.
 */
export function displayOrder(
  field: { name: string; optionsAr?: Record<string, string> | null },
  values: readonly string[],
): string[] {
  if (currentLocale() !== 'ar' || !field.optionsAr) return [...values];
  const dictionary =
    DICTIONARY_FIELDS.has(field.name) || (values.length >= 30 && isAlphabetical(values));
  if (!dictionary) return [...values];
  return [...values].sort((a, b) =>
    optionLabel(field, a).localeCompare(optionLabel(field, b), 'ar'),
  );
}

/**
 * Sort `values` by an Arabic label map when reading Arabic (registration and
 * profile country/nationality lists, which come from `GET /profile/options`).
 */
export function sortByLabel(
  values: readonly string[],
  labels?: Record<string, string> | null,
): string[] {
  if (currentLocale() !== 'ar' || !labels) return [...values];
  const shown = (v: string) => localized(v, labels[v]);
  return [...values].sort((a, b) => shown(a).localeCompare(shown(b), 'ar'));
}
