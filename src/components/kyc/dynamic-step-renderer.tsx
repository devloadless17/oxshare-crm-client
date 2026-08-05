'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { PhoneInput, CountryFlagIcon } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ALL_COUNTRIES, ALL_NATIONALITIES } from '@/lib/countries-data';
import { DocumentUploader } from './document-uploader';
import { SelfieCamera } from './selfie-camera';
import { CheckCircle2, User, FileText } from 'lucide-react';
import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';

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

/**
 * FR-CORE-15: applicants must be 18+, so the date-of-birth picker stops there.
 *
 * Evaluated once when the module loads, not during render. Date.now() in a
 * render body (or in a useMemo, which React may re-run at any time) makes the
 * component impure: two renders a millisecond apart can disagree. The value is
 * fresh per page load, and the real check is server-side anyway.
 */
const MAX_DATE_OF_BIRTH = new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];

/**
 * Browser hints for a free-text profile field, keyed on the field's machine name.
 *
 * Not decoration. This form is filled in once, on a phone, with a keyboard
 * covering half the screen — and it carried NO `autoComplete` attribute
 * anywhere, so a saved address was never offered and every character of it was
 * typed by hand. `autoCapitalize` matters for the same reason in the other
 * direction: name fields were not capitalising and address fields were.
 *
 * Keyed on `name` rather than on `type` because the field set is
 * admin-configurable (D-29) and the names are the contract the portal already
 * submits by — the same ids the reviewer flags for correction. An unknown custom
 * field gets sensible text defaults rather than nothing.
 */
function textInputHints(name: string): {
  autoComplete: string;
  autoCapitalize?: string;
  inputMode?: 'text' | 'tel' | 'email';
  type?: string;
} {
  switch (name) {
    case 'firstName':
      return { autoComplete: 'given-name', autoCapitalize: 'words' };
    case 'lastName':
      return { autoComplete: 'family-name', autoCapitalize: 'words' };
    case 'address':
      return { autoComplete: 'street-address', autoCapitalize: 'words' };
    case 'city':
      return { autoComplete: 'address-level2', autoCapitalize: 'words' };
    case 'postalCode':
    case 'postcode':
      // `inputMode` rather than `type="number"`: postcodes are not numbers —
      // they have letters and leading zeros, and a number input would eat both.
      return { autoComplete: 'postal-code', autoCapitalize: 'characters', inputMode: 'text' };
    case 'phone':
      return { autoComplete: 'tel', inputMode: 'tel', type: 'tel' };
    case 'email':
      return { autoComplete: 'email', inputMode: 'email', type: 'email', autoCapitalize: 'none' };
    case 'nationality':
    case 'country':
      return { autoComplete: 'country-name', autoCapitalize: 'words' };
    default:
      // `off` rather than omitted: an unrecognised custom field is more likely to
      // be document-specific (an ID number, a tax reference) than something the
      // browser has a saved value for, and a wrong autofill is worse than none.
      return { autoComplete: 'off', autoCapitalize: 'sentences' };
  }
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
            .map((field) => {
              const val = formData[field.name] || '';

              // Selfie Live Camera Component
              if (field.name === 'selfie' || field.type === 'camera' || slug === 'selfie') {
                return (
                  <div key={field.id} className="md:col-span-2">
                    <SelfieCamera onUpload={onUpload} uploaded={selfieUploaded} />
                  </div>
                );
              }

              const isErrored = rejectedFields.includes(field.name);

              // Document Uploader Component
              if (field.type === 'file') {
                return (
                  <div
                    key={field.id}
                    className={`space-y-1.5 ${
                      field.name === 'doc_front' ||
                      field.name === 'doc_back' ||
                      field.name === 'address_proof' ||
                      field.name === 'address_proof_2'
                        ? 'md:col-span-1'
                        : 'md:col-span-2'
                    }`}
                  >
                    {isErrored && (
                      <div className="text-[11px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2.5 py-1 rounded-md mb-1 inline-flex items-center gap-1">
                        {t('kyc.documentReturned')}
                      </div>
                    )}
                    <DocumentUploader
                      label={field.label}
                      field={field.name}
                      hint={field.hint}
                      uploaded={uploadsState[field.name]}
                      isErrored={isErrored}
                      onUpload={onUpload}
                    />
                  </div>
                );
              }

              // Phone Input Component
              if (field.type === 'phone') {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>
                        {field.label}{' '}
                        {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          {t('kyc.correctField')}
                        </span>
                      )}
                    </Label>
                    <div
                      className={
                        isErrored
                          ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5'
                          : ''
                      }
                    >
                      <PhoneInput
                        value={val}
                        onChange={(phoneVal) => onChange(field.name, phoneVal)}
                      />
                    </div>
                  </div>
                );
              }

              // Date Picker Component
              if (field.type === 'date') {
                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>
                        {field.label}{' '}
                        {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          {t('kyc.correctField')}
                        </span>
                      )}
                    </Label>
                    <div
                      className={
                        isErrored
                          ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5'
                          : ''
                      }
                    >
                      <DatePicker
                        value={val}
                        onChange={(dateVal) => onChange(field.name, dateVal)}
                        maxDate={field.name === 'dateOfBirth' ? MAX_DATE_OF_BIRTH : undefined}
                      />
                    </div>
                  </div>
                );
              }

              // Select Dropdown Component
              if (field.type === 'select') {
                let optionsList: { label: string; value: string; flagCode?: string }[] = [];

                if (field.name === 'nationality') {
                  optionsList = ALL_NATIONALITIES.map((n) => ({ label: n, value: n }));
                } else if (field.name === 'country') {
                  optionsList = ALL_COUNTRIES.map((c) => ({
                    label: c.name,
                    value: c.name,
                    flagCode: c.code,
                  }));
                } else if (field.options && field.options.length > 0) {
                  optionsList = field.options.map((opt) => ({ label: opt, value: opt }));
                }

                return (
                  <div key={field.id} className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      <span>
                        {field.label}{' '}
                        {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          {t('kyc.correctField')}
                        </span>
                      )}
                    </Label>
                    <div
                      className={
                        isErrored
                          ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5'
                          : ''
                      }
                    >
                      <Select
                        value={val}
                        onValueChange={(selected) => onChange(field.name, selected)}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('kyc.selectField', { label: field.label.toLowerCase() })}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {optionsList.map((opt) => (
                            <SelectItem key={`${opt.value}-${opt.label}`} value={opt.value}>
                              <span className="flex items-center gap-2">
                                {opt.flagCode && <CountryFlagIcon code={opt.flagCode} />}
                                <span>{opt.label}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              }

              // Checkbox Component
              if (field.type === 'checkbox') {
                return (
                  <div key={field.id} className="flex items-center gap-2 md:col-span-2 pt-2">
                    <input
                      type="checkbox"
                      id={field.id}
                      checked={val === 'true'}
                      onChange={(e) => onChange(field.name, e.target.checked ? 'true' : 'false')}
                      className="rounded border-input accent-primary focus:ring-ring h-4 w-4"
                    />
                    <Label htmlFor={field.id} className="text-xs cursor-pointer">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </Label>
                  </div>
                );
              }

              // Text Input Component
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label className="flex items-center justify-between">
                    <span>
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </span>
                    {isErrored && (
                      <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                        {t('kyc.correctField')}
                      </span>
                    )}
                  </Label>
                  <Input
                    placeholder={field.hint || t('kyc.enterField', { label: field.label })}
                    value={val}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    {...textInputHints(field.name)}
                    className={
                      isErrored
                        ? 'border-destructive focus-visible:ring-destructive bg-destructive/5'
                        : ''
                    }
                  />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
