'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import {
  readPersonalDraft,
  readUploadsDraft,
  writePersonalDraft,
  writeUploadsDraft,
} from '@/lib/kyc-draft';
import { useResource } from '@/hooks/use-resource';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';

import { DynamicStepRenderer } from '@/components/kyc/dynamic-step-renderer';
import { t } from '@/lib/i18n';

/**
 * Aliased from the generated schema, so the field-by-field reads below are checked
 * against what the backend actually returns. These were untyped, which made every
 * `data?.personalInfo` and `data.document.docType` an unchecked access on `any` —
 * 30 of this repo's lint warnings came from this one pair of calls.
 */
type KycStepConfigDto = components['schemas']['KycStepConfigDto'];
type KycStatusDto = components['schemas']['KycStatusDto'];

export default function KycStepPage() {
  const params = useParams();
  const router = useRouter();
  const stepNumber = Number(params.step) || 1;

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [docType, setDocType] = useState('passport');
  const [addressDocType, setAddressDocType] = useState('utility_bill');
  const [uploadsState, setUploadsState] = useState<Record<string, boolean>>({});

  /*
   * Files chosen but not yet confirmed.
   *
   * Kept apart from `uploadsState`, which only records what actually reached
   * the server. The two together are what let this step say something true: a
   * client looking at their own photo was told "please upload your proof of
   * address", because from here a pending preview and an empty tile are the
   * same thing — and working out that "Use this" was the missing step cost
   * real time.
   */
  const [pendingUploads, setPendingUploads] = useState<Record<string, boolean>>({});
  const handlePendingChange = useCallback((field: string, hasPending: boolean) => {
    setPendingUploads((prev) =>
      prev[field] === hasPending ? prev : { ...prev, [field]: hasPending },
    );
  }, []);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kycStatus, setKycStatus] = useState<string>('not_started');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectedFields, setRejectedFields] = useState<string[]>([]);

  const set = (k: string, v: string) => {
    setFormData((p) => {
      const updated = { ...p, [k]: v };
      writePersonalDraft(updated);
      return updated;
    });
  };

  /*
   * Two queries, then one effect that syncs their result into form state.
   *
   * ['kyc-config'] is the SAME key the kyc layout uses, so react-query serves both
   * from a single request instead of each fetching /kyc/config independently.
   *
   * Neither query may be swallowed. They used to carry
   * `.catch(() => ({ data: [] }))` and `.catch(() => ({ data: null }))`, which
   * turned a failed request into an empty config — rendering this page as a
   * verification form with no fields and no error, so the user saw a broken step
   * and was told nothing. Both are required for a correct render: without the
   * config there are no fields, and without the status we lose prefill and, worse,
   * the rejection notice on a returned KYC.
   */
  const configQuery = useResource(
    ['kyc-config'],
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
  );
  const statusQuery = useResource(
    ['kyc-status'],
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  const fetchingInitialData = configQuery.status === 'loading' || statusQuery.status === 'loading';
  const loadError =
    configQuery.status === 'error' || configQuery.status === 'unavailable'
      ? apiErrorMessage(configQuery.error, t('kyc.loadFailed'))
      : statusQuery.status === 'error' || statusQuery.status === 'unavailable'
        ? apiErrorMessage(statusQuery.error, t('kyc.loadFailed'))
        : '';

  const stepConfigs = configQuery.data ?? [];

  /*
   * Restores half-filled input from sessionStorage and folds in whatever the
   * server already has.
   *
   * The sessionStorage reads are a deliberate exception to
   * react-hooks/set-state-in-effect: this IS the case the rule's own docs allow,
   * synchronising React state with an external system. A lazy useState initialiser
   * would read sessionStorage during render, which the server cannot do, producing
   * a hydration mismatch on a form the user has half-filled.
   *
   * Local edits win over the server copy — the client typed them more recently.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cachedPersonal = readPersonalDraft();
    const cachedUploads = readUploadsDraft();
    const data = statusQuery.data;

    const fromServer = data?.personalInfo
      ? Object.fromEntries(
          Object.entries(data.personalInfo)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      : {};
    const mergedPersonal = { ...fromServer, ...cachedPersonal };
    if (Object.keys(mergedPersonal).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
      setFormData(mergedPersonal);
      writePersonalDraft(mergedPersonal);
    }

    const uploads: Record<string, boolean> = { ...cachedUploads };
    if (data?.status) setKycStatus(data.status);
    if (data?.rejectionReason) setRejectionReason(data.rejectionReason);
    if (data?.rejectedFields) setRejectedFields(data.rejectedFields);
    if (data?.document) {
      if (data.document.docType) setDocType(data.document.docType);
      if (data.document.frontFilePath) uploads['doc_front'] = true;
      if (data.document.backFilePath) uploads['doc_back'] = true;
    }
    if (data?.selfie?.filePath) {
      setSelfieUploaded(true);
      uploads['selfie'] = true;
    }
    if (data?.addressProof) {
      if (data.addressProof.docType) setAddressDocType(data.addressProof.docType);
      if (data.addressProof.filePath) uploads['address_proof'] = true;
      if (data.addressProof.page2FilePath) uploads['address_proof_2'] = true;
    }
    if (uploads['selfie']) setSelfieUploaded(true);
    setUploadsState(uploads);
    writeUploadsDraft(uploads);
  }, [statusQuery.data]);

  /*
   * Upload handler.
   *
   * `onProgress` is threaded down so the uploader can show a determinate bar.
   * A spinner reading "please wait" is indistinguishable from a hung request,
   * and on mobile data a 4 MB document is 30+ seconds of exactly that — which
   * is where people close the tab.
   */
  const handleUpload = useCallback(
    async (field: string, file: File, onProgress?: (percent: number) => void) => {
      setError('');
      const form = new FormData();
      form.append('file', file);
      form.append('field', field);
      await api.post<{ message?: string }>('/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          // `total` is absent on some proxies and in some browsers; without it a
          // percentage would be a guess, so leave the bar where it is rather
          // than inventing movement.
          if (onProgress && e.total) {
            onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          }
        },
      });

      setUploadsState((p) => {
        const updated = { ...p, [field]: true };
        writeUploadsDraft(updated);
        return updated;
      });

      if (field === 'selfie') setSelfieUploaded(true);
    },
    [],
  );

  const currentStepConfig =
    stepConfigs.find((s) => s.stepNumber === stepNumber) || stepConfigs[stepNumber - 1];

  const totalSteps = stepConfigs.length || 5;

  /* Save step data and advance */
  const handleNext = async () => {
    setError('');
    setLoading(true);
    try {
      const slug = currentStepConfig?.slug || 'personal';

      if (slug === 'personal') {
        if (
          !formData.firstName ||
          !formData.lastName ||
          !formData.dateOfBirth ||
          !formData.nationality ||
          !formData.country ||
          !formData.phone
        ) {
          setError(t('kyc.requiredFields'));
          setLoading(false);
          return;
        }
        const dob = new Date(formData.dateOfBirth);
        const minAgeDate = new Date();
        minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
        if (dob > minAgeDate) {
          setError(t('kyc.tooYoung'));
          setLoading(false);
          return;
        }
        await api.post<{ message?: string }>('/kyc/step', { step: 'personal', data: formData });
      } else if (slug === 'document') {
        if (!uploadsState['doc_front']) {
          // "Confirm it" when a photo is sitting there, "upload one" when none is.
          setError(
            pendingUploads['doc_front'] ? t('kyc.confirmChosenPhoto') : t('kyc.needDocFront'),
          );
          setLoading(false);
          return;
        }
        if (docType !== 'passport' && !uploadsState['doc_back']) {
          setError(
            t('kyc.needDocBack', {
              document:
                docType === 'national_id' ? t('kyc.docNationalId') : t('kyc.docDrivingLicense'),
            }),
          );
          setLoading(false);
          return;
        }
        await api.post<{ message?: string }>('/kyc/step', { step: 'document', data: { docType } });
      } else if (slug === 'selfie') {
        if (!selfieUploaded) {
          setError(t('kyc.needSelfie'));
          setLoading(false);
          return;
        }
        await api.post<{ message?: string }>('/kyc/step', { step: 'selfie', data: {} });
      } else if (slug === 'address') {
        if (!uploadsState['address_proof']) {
          // "Confirm it" when a photo is sitting there, "upload one" when none is.
          setError(
            pendingUploads['address_proof']
              ? t('kyc.confirmChosenPhoto')
              : t('kyc.needAddressProof'),
          );
          setLoading(false);
          return;
        }
        await api.post<{ message?: string }>('/kyc/step', {
          step: 'address',
          data: { docType: addressDocType },
        });
      } else if (slug === 'review') {
        if (formData.firstName || formData.lastName) {
          await api.post<{ message?: string }>('/kyc/step', { step: 'personal', data: formData });
        }
        await api.post<{ message?: string }>('/kyc/submit');
        router.push('/kyc/submitted');
        return;
      }

      if (stepNumber < totalSteps) {
        router.push(`/kyc/step/${stepNumber + 1}`);
      } else {
        if (formData.firstName || formData.lastName) {
          await api.post<{ message?: string }>('/kyc/step', { step: 'personal', data: formData });
        }
        await api.post<{ message?: string }>('/kyc/submit');
        router.push('/kyc/submitted');
      }
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('common.genericError')));
    } finally {
      setLoading(false);
    }
  };

  // Fail loudly. Rendering the form with `stepConfigs` empty would show the user
  // an onboarding step with no fields and no explanation.
  if (loadError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[45vh] p-6 text-center space-y-4"
      >
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{t('kyc.loadFailedShort')}</p>
          <p className="text-xs text-muted-foreground max-w-sm">{loadError}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void configQuery.refetch();
            void statusQuery.refetch();
          }}
        >
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (fetchingInitialData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[45vh] p-6 text-center space-y-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-link border border-primary/20">
          <Loader2 className="h-7 w-7 animate-spin text-link" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{t('kyc.loadingTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('kyc.loadingBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Rejection Notice Banner */}
      {kycStatus === 'rejected' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-1.5 animate-in fade-in-0">
          <div className="flex items-center gap-2 font-bold text-destructive text-sm">
            <span>{t('kyc.actionRequired')}</span>
          </div>
          {rejectionReason && (
            <p className="text-destructive text-xs">
              <strong className="font-semibold text-destructive">{t('kyc.rejectionNote')}</strong>{' '}
              {rejectionReason}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">{t('kyc.updateHighlighted')}</p>
        </div>
      )}

      {/* Dynamic Step Component Renderer */}
      <DynamicStepRenderer
        currentStepConfig={currentStepConfig}
        formData={formData}
        docType={docType}
        addressDocType={addressDocType}
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={rejectedFields}
        onDocTypeChange={setDocType}
        onAddressDocTypeChange={setAddressDocType}
        onChange={set}
        onUpload={handleUpload}
        onPendingChange={handlePendingChange}
      />

      {/* Global Error Banner */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in-0">
          {error}
        </div>
      )}

      {/* Navigation Footer Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        {stepNumber > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/kyc/step/${stepNumber - 1}`)}
            disabled={loading}
          >
            {t('common.back')}
          </Button>
        ) : (
          <div />
        )}

        <Button
          type="button"
          onClick={() => void handleNext()}
          disabled={loading}
          className="font-bold px-6 cursor-pointer"
        >
          {loading
            ? t('kyc.processing')
            : stepNumber === totalSteps || currentStepConfig?.slug === 'review'
              ? t('kyc.submitCta')
              : t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
