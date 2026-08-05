'use client';

import { DocumentUploader } from './document-uploader';
import { CheckCircle2, User, FileText } from 'lucide-react';
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

interface DynamicStepRendererProps {
  currentStepConfig?: KycStepConfig;
  formData: Record<string, string>;
  docType: string;
  addressDocType: string;
  uploadsState: Record<string, boolean>;
  selfieUploaded: boolean;
  rejectedFields?: string[];
  onDocTypeChange: (type: string) => void;
  onAddressDocTypeChange: (type: string) => void;
  onChange: (key: string, value: string) => void;
  onUpload: (field: string, file: File) => Promise<void>;
}

export function DynamicStepRenderer({
  currentStepConfig,
  formData,
  docType,
  addressDocType,
  uploadsState,
  selfieUploaded,
  rejectedFields = [],
  onDocTypeChange,
  onAddressDocTypeChange,
  onChange,
  onUpload,
}: DynamicStepRendererProps) {
  if (!currentStepConfig) return null;

  const { slug, title, description, fields } = currentStepConfig;

  // Review Summary Step
  if (slug === 'review') {
    return (
      <div className="space-y-6">
        <div className="step-header">
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
      <div className="step-header">
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>

      {/* Built-in Document Selector Cards for Document Step */}
      {slug === 'document' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { value: 'passport', label: 'Passport' },
            { value: 'national_id', label: t('kyc.docNationalId') },
            { value: 'driving_license', label: t('kyc.docDrivingLicense') },
          ].map((dt) => {
            const isSelected = docType === dt.value;
            return (
              <button
                key={dt.value}
                type="button"
                onClick={() => onDocTypeChange(dt.value)}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center focus-outline cursor-pointer ${
                  isSelected
                    ? 'border-ring bg-primary/10 text-link font-bold shadow-sm'
                    : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span className="text-xs">{dt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Built-in Document Selector Cards for Address Step */}
      {slug === 'address' && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { value: 'utility_bill', label: t('kyc.docUtilityBill') },
            { value: 'bank_statement', label: t('kyc.docBankStatement') },
            { value: 'tenancy_agreement', label: t('kyc.docTenancyAgreement') },
          ].map((dt) => {
            const isSelected = addressDocType === dt.value;
            return (
              <button
                key={dt.value}
                type="button"
                onClick={() => onAddressDocTypeChange(dt.value)}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center focus-outline cursor-pointer ${
                  isSelected
                    ? 'border-ring bg-primary/10 text-link font-bold shadow-sm'
                    : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <span className="text-xs">{dt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Special passport single upload handling in document step */}
      {slug === 'document' && docType === 'passport' ? (
        <div className="w-full my-4">
          <DocumentUploader
            label={t('kyc.passportLabel')}
            field="doc_front"
            hint={t('kyc.passportHint')}
            uploaded={uploadsState['doc_front']}
            onUpload={onUpload}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields
            .filter((field) => field.name !== 'docType')
            .map((field) => (
              <StepField
                key={field.id}
                field={field}
                slug={slug}
                val={formData[field.name] || ''}
                isErrored={rejectedFields.includes(field.name)}
                selfieUploaded={selfieUploaded}
                uploadsState={uploadsState}
                onChange={onChange}
                onUpload={onUpload}
              />
            ))}
        </div>
      )}
    </div>
  );
}
