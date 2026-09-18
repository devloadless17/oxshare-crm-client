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
import { COUNTRY_CODE_BY_NAME } from '@/lib/countries-data';
import { DocumentUploader } from './document-uploader';
import { SelfieCamera } from './selfie-camera';
import { t } from '@/lib/i18n';
import { MAX_DATE_OF_BIRTH, textInputHints, type KycFieldConfig } from './field-hints';

/**
 * One configured KYC field, rendered.
 *
 * Extracted from `DynamicStepRenderer`, which had grown past its `max-lines`
 * cap — that cap is a ratchet in this repo, so adding a branch meant taking
 * something out rather than raising the number.
 *
 * It is also the more honest boundary: the renderer decides WHICH fields a step
 * shows and how the step is laid out; this decides what a single field looks
 * like. Every branch is on the field's configured `type` or `name`, both of
 * which come from the admin KYC builder (D-29).
 */
/**
 * Compile-time proof that every field type above has been handled.
 *
 * Accepts only `never`, which is what `field.type` narrows to once every member
 * of the union has been ruled out by the branches above. A new member makes the
 * argument a real type and the call a compile error, naming the file that has
 * to change.
 *
 * Two things are allowed through: `text`, which is legitimately the fallback,
 * and `doc:*`, which never reaches this component — `dynamic-step-renderer`
 * splits document fields out by `field.document` before rendering — but which
 * TypeScript cannot know is gone, because nothing in the type says so.
 *
 * NOT `string & {}`. That was the first attempt and it accepted every string,
 * so it compiled, read as a guard, and guaranteed nothing — a fake exactly like
 * the ones this codebase keeps finding. The signature has to be narrow enough
 * to break.
 */
function assertExhaustive(_type: 'text' | `doc:${string}`): void {
  // Intentionally empty: the guarantee is in the signature, not the body.
}

export function StepField({
  field,
  slug,
  val,
  isErrored,
  selfieUploaded,
  uploadsState,
  onChange,
  onUpload,
  onPendingChange,
}: {
  field: KycFieldConfig;
  slug: string;
  val: string;
  isErrored: boolean;
  selfieUploaded: boolean;
  uploadsState: Record<string, boolean>;
  onChange: (key: string, value: string) => void;
  onUpload: (field: string, file: File, onProgress?: (percent: number) => void) => Promise<void>;
  /** Threaded to the uploader so the step can tell 'nothing chosen' from 'chosen, not confirmed'. */
  onPendingChange?: (field: string, hasPending: boolean) => void;
}) {
  // Selfie Live Camera Component
  if (field.name === 'selfie' || field.type === 'camera' || slug === 'selfie') {
    return (
      <div key={field.id} className="md:col-span-2">
        <SelfieCamera onUpload={onUpload} uploaded={selfieUploaded} />
      </div>
    );
  }

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
          onPendingChange={onPendingChange}
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
              {t('kyc.correctField')}
            </span>
          )}
        </Label>
        <div
          className={
            isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''
          }
        >
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
              {t('kyc.correctField')}
            </span>
          )}
        </Label>
        <div
          className={
            isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''
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
    /*
     * OPTIONS COME FROM THE CONFIG, whatever the field is called.
     *
     * This branched on `field.name === 'nationality'` and `=== 'country'` and
     * filled them from a 258-line local array. The config carried no options
     * for either, so the admin builder showed both as "Dropdown with no
     * choices" — an operator could not see the list, could not edit it, and a
     * field they named anything else got an empty dropdown.
     *
     * The lists are served now (`common/kyc/country-options.ts`), so this
     * renders what it is given.
     */
    const optionsList = (field.options ?? []).map((opt) => ({
      label: opt,
      value: opt,
      /*
       * The flag is looked up BY NAME rather than configured, and stays local:
       * it is decoration on a value the server chose, and a country with no
       * match simply renders without one. `ALL_COUNTRIES` is still the phone
       * picker's source, so this adds no import that was not already here.
       */
      flagCode: COUNTRY_CODE_BY_NAME.get(opt),
    }));

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
        <div
          className={
            isErrored ? 'rounded-lg ring-2 ring-destructive/80 bg-destructive/5 p-0.5' : ''
          }
        >
          {/*
           * The styled Select for EVERY list length, on an explicit
           * instruction. A native <select> used to take over past 20 options
           * (nationality and country are ~250 each) because the OS picker
           * gives phones type-ahead and a wheel — that trade was reversed for
           * one control that looks the same as every other field on the form,
           * flags included. If long-list picking on phones comes back as a
           * complaint, the answer is a search box inside the dropdown, not
           * the native control's page-grey chrome.
           */}
          <Select value={val} onValueChange={(selected) => onChange(field.name, selected)}>
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

  /*
   * ── EVERY OTHER TYPE FALLS HERE, AND THAT HAS TO BE A DECISION ────────────
   *
   * The branches above cover `camera`, `file`, `phone`, `date`, `select` and
   * `checkbox`; `doc:*` fields never reach this component at all
   * (`dynamic-step-renderer` splits them out by `field.document`). So the only
   * type that SHOULD land here is `text`.
   *
   * The risk is not today's list, it is the next addition to it. The admin
   * builder is protected — `FIELD_TYPES` is `satisfies`-checked against the
   * generated union — but nothing protected this file, so a type added to the
   * API would render as a plain text box: no error, no warning, and a client
   * typing words where the form meant to ask for something else.
   *
   * `assertExhaustive` makes that a COMPILE error instead. It is typed to accept
   * only `never`, so the day a member is added to the union and not handled
   * above, `rest` stops being `never` and this line stops compiling.
   *
   * It does not throw at runtime, deliberately. A configuration that somehow
   * reaches production with an unknown type should still render SOMETHING a
   * client can use rather than a blank step — the compile error is for us, the
   * text box is for them.
   */
  assertExhaustive(field.type);

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
          isErrored ? 'border-destructive focus-visible:ring-destructive bg-destructive/5' : ''
        }
      />
    </div>
  );
}
