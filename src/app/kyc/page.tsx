'use client';

import * as React from 'react';
import {
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react';

interface KycField {
  id: string;
  fieldName: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'file' | 'date' | 'checkbox';
  options?: string[];
  isRequired: boolean;
}

export default function ClientKycPage() {
  const [fields, setFields] = React.useState<KycField[]>([
    {
      id: '1',
      fieldName: 'id_document',
      label: 'Government Photo ID (Passport / National ID)',
      fieldType: 'file',
      isRequired: true,
    },
    {
      id: '2',
      fieldName: 'proof_of_address',
      label: 'Proof of Address (Utility Bill / Bank Statement)',
      fieldType: 'file',
      isRequired: true,
    },
    {
      id: '3',
      fieldName: 'tax_id',
      label: 'Tax Identification Number (TIN / SSN)',
      fieldType: 'text',
      isRequired: false,
    },
    {
      id: '4',
      fieldName: 'country_residence',
      label: 'Country of Residence',
      fieldType: 'select',
      options: ['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'United Kingdom'],
      isRequired: true,
    },
  ]);

  const [formData, setFormData] = React.useState<Record<string, any>>({});
  const [fileNames, setFileNames] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleFileChange = (fieldName: string, file: File | null) => {
    if (file) {
      setFileNames((prev) => ({ ...prev, [fieldName]: file.name }));
      setFormData((prev) => ({ ...prev, [fieldName]: file.name }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Identity & KYC Verification</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete your dynamic verification documents to unlock full trading limits
        </p>
      </div>

      {submitted ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            KYC Documents Under Review
          </h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Your verification submission has been received. Our compliance team will review your documents within 24 hours.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-6">
            {fields.map((field) => (
              <div key={field.id} className="space-y-2 border-b border-border/50 pb-5 last:border-b-0 last:pb-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <span>{field.label}</span>
                  {field.isRequired && <span className="text-rose-500">*</span>}
                </label>

                {field.fieldType === 'text' && (
                  <input
                    type="text"
                    required={field.isRequired}
                    placeholder={`Enter your ${field.label}`}
                    value={formData[field.fieldName] || ''}
                    onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}

                {field.fieldType === 'select' && (
                  <select
                    required={field.isRequired}
                    value={formData[field.fieldName] || ''}
                    onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Select an option</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {field.fieldType === 'file' && (
                  <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center hover:bg-muted/40 transition-all cursor-pointer">
                    <input
                      type="file"
                      required={field.isRequired}
                      onChange={(e) => handleFileChange(field.fieldName, e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <UploadCloud className="h-8 w-8 text-blue-500 mb-2" />
                    <p className="text-xs font-semibold">
                      {fileNames[field.fieldName] ? (
                        <span className="text-emerald-500 font-bold">{fileNames[field.fieldName]}</span>
                      ) : (
                        'Click to upload or drag & drop file'
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">PDF, JPG, PNG up to 10MB</p>
                  </div>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-md hover:bg-blue-500 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting KYC Documents...</span>
                </>
              ) : (
                <span>Submit Verification Documents</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
