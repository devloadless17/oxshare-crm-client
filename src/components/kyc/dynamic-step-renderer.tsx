'use client';

import { CheckCircle2, User, FileText } from 'lucide-react';
import { DocumentUploader } from './document-uploader';
import { documentChoiceKey, uploadFieldFor, uploadSlotName } from './doc-type';
import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';
import { StepField } from './step-field';

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
interface DynamicStepRendererProps {
  currentStepConfig?: KycStepConfig;
  formData: Record<string, string>;
  uploadsState: Record<string, boolean>;
  selfieUploaded: boolean;
  rejectedFields?: string[];
  /**
   * The document the SERVER actually holds a file for, per category.
   *
   * Needed because every identity document's first page is stored in the same
   * column: `apiUploadField` maps passport, national ID and driving licence all
   * onto `doc_front` (see its note on why storage was not reshaped). So
   * "is `doc_front` filled?" cannot answer "has the client uploaded THIS
   * document?" — and reading it as if it could meant that after uploading a
   * passport, switching the picker to National ID showed its slot as already
   * satisfied, offering the passport as though it were the ID.
   */
  storedDocValues?: { identity?: string; address?: string };
  onChange: (key: string, value: string) => void;
  onUpload: (field: string, file: File) => Promise<void>;
  /** Threaded to the uploader so the step can tell 'nothing chosen' from 'chosen, not confirmed'. */
  onPendingChange?: (field: string, hasPending: boolean) => void;
}

export function DynamicStepRenderer({
  currentStepConfig,
  formData,
  uploadsState,
  selfieUploaded,
  rejectedFields = [],
  storedDocValues,
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
   * Uploads and long text get the full row; short inputs pair up. Derived from
   * the field TYPE rather than from a per-step layout, so a step an operator
   * builds looks like the seeded ones without them configuring anything.
   */
  const fieldSpan = (field: KycFieldConfig) =>
    field.type === 'file' || field.type === 'camera' ? 'md:col-span-2' : '';

  // Review Summary Step
  if (slug === 'review') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3 text-link">
              <User className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {t('kyc.personalInfo')}
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">{t('kyc.fullName')}</span>
                <span className="font-semibold text-foreground">
                  {formData.firstName || '-'} {formData.lastName || '-'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  {t('kyc.dateOfBirth')}
                </span>
                <span className="font-semibold text-foreground">{formData.dateOfBirth || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">{t('kyc.phone')}</span>
                <span className="font-semibold text-foreground font-mono">
                  {formData.phone || '-'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">
                  {t('kyc.nationality')}
                </span>
                <span className="font-semibold text-foreground">{formData.nationality || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">{t('kyc.country')}</span>
                <span className="font-semibold text-foreground">{formData.country || '-'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3 text-link">
              <FileText className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {t('kyc.verificationFiles')}
              </h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">{t('kyc.idDocument')}</span>
                {uploadsState['doc_front'] ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('kyc.uploaded')}
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">{t('kyc.missing')}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">{t('kyc.selfiePhoto')}</span>
                {selfieUploaded ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('kyc.captured')}
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">{t('kyc.missing')}</span>
                )}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">{t('kyc.proofOfAddress')}</span>
                {uploadsState['address_proof'] ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('kyc.uploaded')}
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">{t('kyc.missing')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
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
              isErrored={rejectedFields.includes(field.name)}
              selfieUploaded={selfieUploaded}
              uploadsState={uploadsState}
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
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => onChange(choiceKey, field.name)}
                  className={`focus-outline flex cursor-pointer flex-col items-center justify-center rounded-xl border p-4 text-center ${
                    isSelected
                      ? 'border-ring bg-primary/10 font-bold text-link'
                      : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="text-xs">{field.label}</span>
                  <span className="mt-0.5 text-[10px] opacity-70">
                    {t('kyc.pageCount', { count: parts.length })}
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
             * The UI keys on the SLOT (unique per field); the API is posted the
             * storage field it has always used (`doc_front`). `apiUploadField`
             * is the single place that translation lives — see its note on why
             * storage was not reshaped instead.
             */
            const slot = uploadSlotName(chosenField!.name, part.key);
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
             * The stored-column fallback applies ONLY to the document the file
             * actually belongs to.
             *
             * `uploadsState[slot]` is this session's upload. The fallback exists
             * for the client who comes BACK: their file is known to the server
             * under `doc_front`, and without it a returning client would be
             * asked to upload a passport the system already holds.
             *
             * Unconditional, it was a lie for the other two choices. The column
             * is shared by every identity document, so a passport on file made
             * National ID and Driving Licence both look uploaded — the client
             * pressed Continue and submitted a passport as their national ID.
             * Gating on the stored docType keeps the returning client's file
             * and stops it standing in for a document they never sent.
             */
            const category = chosenField!.document?.category;
            const storedValue =
              category === 'address' ? storedDocValues?.address : storedDocValues?.identity;
            const isStoredDocument = chosenField!.document?.value === storedValue;

            return (
              <DocumentUploader
                key={part.key}
                field={apiField}
                label={part.label}
                hint={part.hint ?? (part.required ? undefined : t('kyc.optionalUpload'))}
                uploaded={uploadsState[slot] || (isStoredDocument && uploadsState[apiField])}
                onUpload={onUpload}
                onPendingChange={onPendingChange}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
