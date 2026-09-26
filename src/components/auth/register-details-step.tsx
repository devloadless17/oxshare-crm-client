'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
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
import { MAX_DATE_OF_BIRTH } from '@/components/kyc/field-hints';
import { ALL_COUNTRIES, COUNTRY_CODE_BY_NAME } from '@/lib/countries-data';
import { useResource, type Resource } from '@/hooks/use-resource';
import { profileApi, type ProfileOptions } from '@/lib/api/profile';
import { keys } from '@/lib/query-keys';
import { AsyncBoundary } from '@/components/async-boundary';
import {
  requiredDetailFields,
  hasNationalNumber,
  type RegisterField,
  type RegisterValues,
} from '@/lib/register-form';
import { t } from '@/lib/i18n';

/**
 * Sign-up, step 2 — the personal details the identity verification opens with.
 *
 * The same controls the KYC personal step uses (the date input capped at 18
 * years ago, the phone input with its dial-code picker, the styled select with
 * flags), so a client meets each field the same way in both places — and the
 * lists are the SERVER's, the ones the profile accepts, never a copy.
 */
export function RegisterDetailsStep({
  values,
  errors,
  onChange,
}: {
  values: RegisterValues;
  errors: Partial<Record<RegisterField, string>>;
  onChange: (field: RegisterField, value: string) => void;
}) {
  /*
   * The server's lists. The page PREFETCHES them while the client is on step 1
   * (`prefetchProfileOptions`), so this normally resolves from the cache; if
   * it did not arrive, the standard boundary says so with a retry — never an
   * empty drop-down, which reads as "there is nothing to choose".
   */
  const options = useResource(keys.profileOptions.all(), (signal) => profileApi.options(signal), {
    // A person is in front of the retry below, and the page's prefetch was
    // already one attempt — so no silent back-off before saying so.
    retry: 0,
  });
  // Which details sign-up requires — the server's rule, served with the lists.
  const required = requiredDetailFields(options.data);

  /*
   * Choosing where they live starts the phone number in that country — while
   * nothing has been typed into it. Once digits are there the number is the
   * client's, and a later change of country must not rewrite it.
   */
  const chooseCountry = (country: string) => {
    onChange('country', country);
    const iso = COUNTRY_CODE_BY_NAME.get(country);
    const dialCode = ALL_COUNTRIES.find((c) => c.code === iso)?.dialCode;
    if (dialCode && !hasNationalNumber(values.phone)) {
      onChange('phone', dialCode);
    }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-px h-4 w-4 shrink-0 text-link" aria-hidden="true" />
        <span>{t('auth.register.detailsNote')}</span>
      </p>

      <AsyncBoundary
        status={options.status}
        label={t('auth.register.listLoading')}
        endpoints={['GET /profile/options']}
        onRetry={() => options.refetch()}
        errorMessage={t('auth.register.listFailed')}
        error={options.error}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            required={required.includes('dateOfBirth')}
            field="dateOfBirth"
            label={t('auth.register.dateOfBirth')}
            errors={errors}
          >
            <DatePicker
              id="dateOfBirth"
              value={values.dateOfBirth}
              onChange={(value) => onChange('dateOfBirth', value)}
              maxDate={MAX_DATE_OF_BIRTH}
              autoComplete="bday"
              aria-invalid={Boolean(errors.dateOfBirth)}
              aria-describedby={describedBy('dateOfBirth', errors)}
            />
          </Field>

          <Field
            required={required.includes('nationality')}
            field="nationality"
            label={t('auth.register.nationality')}
            errors={errors}
          >
            <ChoiceSelect
              field="nationality"
              label={t('auth.register.nationality')}
              value={values.nationality}
              choices={options.data?.nationalities}
              status={options.status}
              invalid={Boolean(errors.nationality)}
              onChange={(value) => onChange('nationality', value)}
            />
          </Field>

          <Field
            required={required.includes('country')}
            field="country"
            label={t('auth.register.country')}
            errors={errors}
          >
            <ChoiceSelect
              field="country"
              label={t('auth.register.country')}
              value={values.country}
              choices={options.data?.countries}
              status={options.status}
              invalid={Boolean(errors.country)}
              withFlags
              onChange={chooseCountry}
            />
          </Field>

          <Field
            required={required.includes('phone')}
            field="phone"
            label={t('auth.register.phone')}
            errors={errors}
          >
            <PhoneInput
              aria-label={t('auth.register.phone')}
              value={values.phone}
              onChange={(value) => onChange('phone', value)}
            />
          </Field>

          <Field
            required={required.includes('city')}
            field="city"
            label={t('auth.register.city')}
            errors={errors}
          >
            <Input
              id="city"
              value={values.city}
              onChange={(e) => onChange('city', e.target.value)}
              placeholder={t('auth.register.cityPlaceholder')}
              autoComplete="address-level2"
              maxLength={100}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={describedBy('city', errors)}
              className="h-11"
            />
          </Field>

          <Field
            required={required.includes('postalCode')}
            field="postalCode"
            label={t('auth.register.postalCode')}
            hint={t('auth.register.postalCodeHint')}
            errors={errors}
          >
            <Input
              id="postalCode"
              value={values.postalCode}
              onChange={(e) => onChange('postalCode', e.target.value)}
              placeholder={t('auth.register.postalCodePlaceholder')}
              autoComplete="postal-code"
              maxLength={12}
              aria-invalid={Boolean(errors.postalCode)}
              aria-describedby={describedBy('postalCode', errors, true)}
              className="h-11 uppercase placeholder:normal-case"
            />
          </Field>

          <Field
            required={required.includes('address')}
            field="address"
            label={t('auth.register.address')}
            errors={errors}
            className="sm:col-span-2"
          >
            <Input
              id="address"
              value={values.address}
              onChange={(e) => onChange('address', e.target.value)}
              placeholder={t('auth.register.addressPlaceholder')}
              autoComplete="street-address"
              maxLength={200}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={describedBy('address', errors)}
              className="h-11"
            />
          </Field>
        </div>
      </AsyncBoundary>
    </div>
  );
}

/**
 * Start fetching the lists before step 2 is on screen — called by the page on
 * mount, so a client who reaches the details finds them already there.
 */
export function usePrefetchProfileOptions(): void {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: keys.profileOptions.all(),
      queryFn: ({ signal }) => profileApi.options(signal),
    });
  }, [queryClient]);
}

/** The ids a control's description lives under — its error, its hint. */
function describedBy(
  field: RegisterField,
  errors: Partial<Record<RegisterField, string>>,
  hasHint = false,
): string | undefined {
  const ids = [errors[field] ? `${field}-error` : '', hasHint ? `${field}-hint` : ''].filter(
    Boolean,
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * One labelled field, with its hint and the server's sentence about it.
 *
 * The message sits UNDER the box it belongs to and is tied to it by
 * `aria-describedby`, so a screen reader reads "Date of birth, invalid: you
 * must be at least 18" rather than a banner at the top of the form.
 */
function Field({
  field,
  label,
  hint,
  errors,
  required,
  className,
  children,
}: {
  field: RegisterField;
  label: string;
  hint?: string;
  errors: Partial<Record<RegisterField, string>>;
  /** The server's rule — `requiredDetailFields`. */
  required: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const error = errors[field];
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={field} className="text-xs font-semibold text-foreground">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {' '}
            *
          </span>
        ) : (
          <span className="font-normal text-muted-foreground"> {t('auth.register.optional')}</span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${field}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${field}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A drop-down over one of the server's lists. While the list is on its way the
 * control says so and cannot be opened; if it could not be fetched the control
 * says THAT — an empty drop-down would read as "there is no country to pick".
 */
function ChoiceSelect({
  field,
  label,
  value,
  choices,
  status,
  invalid,
  withFlags = false,
  onChange,
}: {
  field: RegisterField;
  label: string;
  value: string;
  choices: readonly string[] | undefined;
  status: Resource<ProfileOptions>['status'];
  invalid: boolean;
  withFlags?: boolean;
  onChange: (value: string) => void;
}) {
  const placeholder =
    status === 'loading'
      ? t('auth.register.listLoading')
      : status === 'ready'
        ? t('kyc.selectField', { label: label.toLowerCase() })
        : t('auth.register.listFailed');
  return (
    <Select value={value} onValueChange={onChange} disabled={status !== 'ready'}>
      <SelectTrigger
        id={field}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${field}-error` : undefined}
        className="h-11"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {(choices ?? []).map((choice) => {
          const flag = withFlags ? COUNTRY_CODE_BY_NAME.get(choice) : undefined;
          return (
            <SelectItem key={choice} value={choice}>
              <span className="flex items-center gap-2">
                {flag && <CountryFlagIcon code={flag} />}
                <span>{choice}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
