'use client';

import { DocumentUploader } from './document-uploader';
import { documentChoiceKey, uploadFieldFor } from './doc-type';
import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';
import { StepField } from './step-field';
import { ReviewSummary } from './review-summary';

/**
 * Aliased from the schema generated out of the backend's Swagger, so this
 * renderer cannot disagree with what /kyc/config actually returns.
 *
 * These were hand-written and had drifted: both declared `description` and `icon`
 * as REQUIRED, while the backend marks them optional. Any step configured without
 * a description would have been a runtime surprise rather than a compile error.
 */
export type KycFieldConfig = components['schemas']['KycFieldConfigDto'];
export type KycStepConfig = components['schemas']['KycStepConfigDto'];

/*
 * `docType`, `addressDocType` and their two setters are GONE from this
 * interface. They existed because the type lived outside the config, so the
 * page had to own it and hand it down. It is a `select` field now, which means
 * it arrives in `formData` and is written by `onChange` exactly like every
 * other answer — four props and two pieces of page state removed.
 */
/** An upload, optionally naming the catalogue document the page belongs to. */
export type UploadHandler = (
  field: string,
  file: File,
  onProgress?: (percent: number) => void,
  docType?: string,
) => Promise<void>;

interface DynamicStepRendererProps {
  currentStepConfig?: KycStepConfig;
  /** Every step, review included — the review screen summarises them all. */
  allSteps?: KycStepConfig[];
  formData: Record<string, string>;
  /**
   * Which slots count as uploaded FOR THE DOCUMENT CHOSEN, with anything the
   * reviewer returned counted as not uploaded — `upload-state.ts`. Reading a
   * shared column as "this document is uploaded" is how a passport stood in
   * for a national ID.
   */
  uploadsState: Record<string, boolean>;
  selfieUploaded: boolean;
  /** The reviewer's flags the client has NOT answered yet. */
  rejectedFields?: string[];
  /** Slot → stored path, so a returning client sees the picture they sent. */
  storedFiles?: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onUpload: UploadHandler;
  /** Threaded to the uploader so the step can tell 'nothing chosen' from 'chosen, not confirmed'. */
  onPendingChange?: (field: string, hasPending: boolean) => void;
}

export function DynamicStepRenderer({
  currentStepConfig,
  allSteps = [],
  formData,
  uploadsState,
  selfieUploaded,
  rejectedFields = [],
  storedFiles = {},
  onChange,
  onUpload,
  onPendingChange,
}: DynamicStepRendererProps) {
  if (!currentStepConfig) return null;

  const { slug, title, description, fields } = currentStepConfig;

  /*
   * THE STEP'S DOCUMENT FIELDS ARE THE CHOICES.
   *
   * Each is a field whose TYPE is the document it collects (`doc:passport`),
   * so a step offering three ways to prove identity is three fields. They are
   * alternatives — one is enough — so the client picks a field and uploads only
   * that document's slots.
   *
   * The slots come from the catalogue via `field.document.parts`, which is why
   * a passport asks for one photo page and a national ID for two sides without
   * this component knowing either fact.
   */
  const documentFields = fields.filter((f) => f.document);
  const plainFields = fields.filter((f) => !f.document);

  /*
   * Which document the client chose, stored under a key derived from the STEP
   * rather than from any one field — the choice belongs to the step, and
   * writing it into a field's own slot would make "chosen" and "this field's
   * answer" the same thing.
   */
  const choiceKey = documentChoiceKey(slug);

  const chosenFieldName = formData[choiceKey] ?? '';
  const chosenField = documentFields.find((f) => f.name === chosenFieldName);

  /*
   * The reviewer returned this document: by its own name, or — for the one on
   * file, which is the one chosen when the client comes back — by one of its
   * pages (`doc_back`). Every identity document's pages share the same ids, so
   * a page flag is read against the chosen document only.
   */
  const documentReturned = (field: KycFieldConfig) =>
    rejectedFields.includes(field.name) ||
    (field.name === chosenFieldName &&
      (field.document?.parts ?? []).some((_, index) => {
        const id = uploadFieldFor(slug, field.name, index, field.document?.category);
        return id !== null && rejectedFields.includes(id);
      }));

  /*
   * Uploads and long text get the full row; short inputs pair up. Derived from
   * the field TYPE rather than from a per-step layout, so a step an operator
   * builds looks like the seeded ones without them configuring anything.
   */
  const fieldSpan = (field: KycFieldConfig) =>
    field.type === 'file' || field.type === 'camera' ? 'md:col-span-2' : '';

  /*
   * The review screen summarises the steps the broker CONFIGURED — it used to
   * be three hard-coded rows (ID, selfie, proof of address) that read "Missing"
   * in red for a step the broker had disabled, and showed nothing of a custom
   * step's answers.
   */
  if (slug === 'review') {
    return (
      <ReviewSummary
        title={title}
        description={description}
        steps={allSteps}
        formData={formData}
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={rejectedFields}
      />
    );
  }

  // 100% Dynamic Step Field Component Layout Engine
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      {/*
       * EVERY FIELD COMES FROM THE CONFIG. No slug branching, no hard-coded
       * document types, no layout the builder cannot see.
       *
       * This block used to render three literal buttons for `document`
       * (Passport / National ID / Driving License) and three more for
       * `address`, none of which existed in the step's `fields`. Worse, the
       * passport branch REPLACED the configured uploads with a single
       * hard-coded one — so a step configured with "Front Side" and "Back
       * Side" showed neither, and an operator adding a field saw nothing
       * change.
       *
       * The type is now a `select` field like any other (migration 0071), so
       * adding a fourth document type is an edit in the KYC builder rather
       * than a code change here.
       */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plainFields.map((field) => (
          <div key={field.id} className={fieldSpan(field)}>
            <StepField
              field={field}
              slug={slug}
              val={formData[field.name] || ''}
              isErrored={
                rejectedFields.includes(field.name) ||
                // The canonical selfie is flagged by its storage id.
                (slug === 'selfie' && rejectedFields.includes('selfie'))
              }
              selfieUploaded={selfieUploaded}
              uploadsState={uploadsState}
              storedFilePath={storedFiles[field.name]}
              onChange={onChange}
              onUpload={onUpload}
              onPendingChange={onPendingChange}
            />
          </div>
        ))}
      </div>

      {documentFields.length > 0 && (
        <div className="space-y-4">
          {/*
           * Cards rather than a dropdown: the choice governs what is asked for
           * next, so the client needs to see the options — and how many photos
           * each costs them — before deciding. A collapsed select hides both.
           */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {documentFields.map((field) => {
              const isSelected = field.name === chosenFieldName;
              const parts = field.document?.parts ?? [];
              // The document the reviewer returned is marked on its own card,
              // not only on its tiles — so the client sees which one it was
              // before choosing anything.
              const isReturned = documentReturned(field);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => onChange(choiceKey, field.name)}
                  className={`focus-outline flex cursor-pointer flex-col items-center justify-center rounded-xl border p-4 text-center ${
                    isReturned
                      ? 'border-destructive/70 bg-destructive/5 font-bold text-destructive'
                      : isSelected
                        ? 'border-ring bg-primary/10 font-bold text-link'
                        : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="text-xs">{field.label}</span>
                  <span className="mt-0.5 text-[10px] opacity-70">
                    {isReturned
                      ? t('kyc.documentReturned')
                      : t('kyc.pageCount', { count: parts.length })}
                  </span>
                </button>
              );
            })}
          </div>

          {/*
           * Only the CHOSEN document's slots. Nothing renders until a choice is
           * made — an upload box for an unstated document is a request the
           * client cannot act on, and it is what let somebody put a passport
           * into a slot labelled "Back Side".
           */}
          {(chosenField?.document?.parts ?? []).map((part, partIndex) => {
            /*
             * Scoped to the STEP. `apiUploadField` maps onto the canonical
             * columns, which is right for `document` and `address` and was
             * being applied everywhere — so a document field on a custom step
             * uploaded over the client's passport. `uploadFieldFor` sends a
             * custom step's file to its own key instead.
             */
            const apiField = uploadFieldFor(
              slug,
              chosenField!.name,
              partIndex,
              chosenField!.document?.category,
            );
            if (!apiField) return null;

            /*
             * `uploadsState` already answers "is THIS document's page on
             * file": a stored page counts only under the chosen document's
             * type, and a page the reviewer returned counts as missing until it
             * is replaced (`upload-state.ts`). This used to be computed here,
             * from a shared column, which is how a passport stood in for a
             * national ID.
             */
            const returned =
              rejectedFields.includes(apiField) || rejectedFields.includes(chosenField!.name);
            // A canonical page says which document it belongs to, so the
            // server files it under the right one.
            const isCanonical = apiField !== chosenField!.name;
            const docValue = isCanonical ? chosenField!.document?.value : undefined;

            return (
              <DocumentUploader
                key={`${chosenField!.name}:${part.key}`}
                field={apiField}
                label={part.label}
                hint={
                  returned
                    ? t('kyc.documentReturnedHint')
                    : (part.hint ?? (part.required ? undefined : t('kyc.optionalUpload')))
                }
                uploaded={Boolean(uploadsState[apiField])}
                isErrored={returned}
                storedFilePath={uploadsState[apiField] ? storedFiles[apiField] : undefined}
                onUpload={(f, file, onProgress) => onUpload(f, file, onProgress, docValue)}
                onPendingChange={onPendingChange}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
