'use client';

import * as React from 'react';
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
import { DocumentUploader } from './DocumentUploader';
import { SelfieCamera } from './SelfieCamera';
import { CheckCircle2, User, FileText } from 'lucide-react';

export interface KycFieldConfig {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'phone' | 'select' | 'file' | 'camera' | 'checkbox';
  required: boolean;
  options?: string[];
  hint?: string;
}

export interface KycStepConfig {
  id: string;
  stepNumber: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  fields: KycFieldConfig[];
}

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
              <h3 className="text-xs font-bold uppercase tracking-wider">Personal Information</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Full Name</span>
                <span className="font-semibold text-foreground">
                  {formData.firstName || '-'} {formData.lastName || '-'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Date of Birth</span>
                <span className="font-semibold text-foreground">{formData.dateOfBirth || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Phone</span>
                <span className="font-semibold text-foreground font-mono">{formData.phone || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Nationality</span>
                <span className="font-semibold text-foreground">{formData.nationality || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Country</span>
                <span className="font-semibold text-foreground">{formData.country || '-'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-3 text-link">
              <FileText className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">Verification Files</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">ID Document</span>
                {uploadsState['doc_front'] ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">Missing</span>
                )}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">Selfie Photo</span>
                {selfieUploaded ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Captured
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">Missing</span>
                )}
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-background/50">
                <span className="text-muted-foreground">Proof of Address</span>
                {uploadsState['address_proof'] ? (
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                  </span>
                ) : (
                  <span className="text-destructive font-semibold">Missing</span>
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
            { value: 'national_id', label: 'National ID' },
            { value: 'driving_license', label: 'Driving License' },
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
            { value: 'utility_bill', label: 'Utility Bill' },
            { value: 'bank_statement', label: 'Bank Statement' },
            { value: 'tenancy_agreement', label: 'Tenancy Agreement' },
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
            label="Passport Bio Page (Required)"
            field="doc_front"
            hint="Upload the main photo & signature page of your passport"
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
                        ⚠️ Document Returned for Correction
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
                        {field.label} {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          ⚠️ Correct Field
                        </span>
                      )}
                    </Label>
                    <div className={isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''}>
                      <PhoneInput value={val} onChange={(phoneVal) => onChange(field.name, phoneVal)} />
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
                        {field.label} {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          ⚠️ Correct Field
                        </span>
                      )}
                    </Label>
                    <div className={isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''}>
                      <DatePicker
                        value={val}
                        onChange={(dateVal) => onChange(field.name, dateVal)}
                        maxDate={
                          field.name === 'dateOfBirth'
                            ? new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
                                .toISOString()
                                .split('T')[0]
                            : undefined
                        }
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
                        {field.label} {field.required && <span className="text-destructive">*</span>}
                      </span>
                      {isErrored && (
                        <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded">
                          ⚠️ Correct Field
                        </span>
                      )}
                    </Label>
                    <div className={isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''}>
                      <Select value={val} onValueChange={(selected) => onChange(field.name, selected)}>
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
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
                        ⚠️ Correct Field
                      </span>
                    )}
                  </Label>
                  <Input
                    placeholder={field.hint || `Enter ${field.label.toLowerCase()}`}
                    value={val}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    className={isErrored ? 'border-destructive focus-visible:ring-destructive bg-destructive/5' : ''}
                  />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
