'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import {
  readPersonalDraft,
  readUploadsDraft,
  writePersonalDraft,
  writeUploadsDraft,
} from '@/lib/kyc-draft';
import { useResource } from '@/hooks/use-resource';
import { withReviewStep } from './review-step';
import {
  chosenDocumentValue,
  missingRequiredParts,
  savedDocumentChoices,
  storedDocValuesOf,
} from './doc-type';
import { planCustomStep, uploadedCustomFields } from './custom-step';
import type { components } from '@/lib/api/types.gen';
import { Button } from '@/components/ui/button';

import { savedAnswersFor } from '@/components/kyc/saved-answers';
import { DynamicStepRenderer } from '@/components/kyc/dynamic-step-renderer';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Aliased from the generated schema, so the field-by-field reads below are checked
 * against what the backend actually returns. These were untyped, which made every
 * `data?.personalInfo` and `data.document.docType` an unchecked access on `any` —
 * 30 of this repo's lint warnings came from this one pair of calls.
 */
type KycStepConfigDto = components['schemas']['KycStepConfigDto'];
type KycStatusDto = components['schemas']['KycStatusDto'];

export function KycStepForm() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const stepNumber = Number(params.step) || 1;

  const [formData, setFormData] = useState<Record<string, string>>({});
  /*
   * The chosen document, read from whichever `document` field the CONFIG
   * declares rather than from a hard-coded key.
   *
   * These were `formData['docType']` and `formData['addressDocType']` — the
   * field names the seed happened to use. A step an operator built with a
   * differently-named field would have saved nothing, which is the same
   * hard-coding this whole change removes, so the name is looked up.
   *
   * `docTypeSlug` still converts, because a value picked before the catalogue
   * existed may be a label rather than a value.
   */
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
    keys.kyc.config(),
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
  );
  const statusQuery = useResource(
    keys.kyc.status(),
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  const fetchingInitialData = configQuery.status === 'loading' || statusQuery.status === 'loading';
  const loadError =
    configQuery.status === 'error' || configQuery.status === 'unavailable'
      ? apiErrorMessage(configQuery.error, t('kyc.loadFailed'))
      : statusQuery.status === 'error' || statusQuery.status === 'unavailable'
        ? apiErrorMessage(statusQuery.error, t('kyc.loadFailed'))
        : '';

  // Always present, always last — see `withReviewStep` for why it is not part
  // of the configurable flow. Memoised so the effects below do not see a new
  // array identity on every render.
  const stepConfigs = useMemo(() => withReviewStep(configQuery.data ?? []), [configQuery.data]);

  const docType = chosenDocumentValue(stepConfigs, formData, 'identity');
  // Which document the SERVER holds a file for — see the renderer's prop note.
  const storedDocValues = storedDocValuesOf(statusQuery.data);
  const addressDocType = chosenDocumentValue(stepConfigs, formData, 'address');

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

    /*
     * Seeded from `savedAnswersFor`, which also knows where a CUSTOM step's
     * answers live — under its own slug in `stepData` rather than in
     * `personalInfo`. Extracted rather than inlined so `stepConfigs` and
     * `stepNumber` are arguments the dependency array can see, instead of
     * closure reads it could not.
     */
    const fromServer = savedAnswersFor(data, stepConfigs, stepNumber);
    /*
     * The saved document types join `formData` BEFORE it is set, because that
     * is where the `select` fields read from now.
     *
     * Converted to the configured LABEL so the option shows as chosen — the
     * API stores `national_id` and the dropdown offers "National ID". A
     * returning client seeing an empty dropdown above their own uploaded
     * document is how they end up re-picking and re-uploading it.
     */
    const savedTypes = savedDocumentChoices(data, configQuery.data ?? []);

    // Local edits still win: `cachedPersonal` is last, so a type the client
    // changed a moment ago is not overwritten by the one on the server.
    const mergedPersonal = { ...fromServer, ...savedTypes, ...cachedPersonal };
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
      if (data.document.frontFilePath) uploads['doc_front'] = true;
      if (data.document.backFilePath) uploads['doc_back'] = true;
    }
    if (data?.selfie?.filePath) {
      setSelfieUploaded(true);
      uploads['selfie'] = true;
    }
    if (data?.addressProof) {
      if (data.addressProof.filePath) uploads['address_proof'] = true;
      if (data.addressProof.page2FilePath) uploads['address_proof_2'] = true;
    }
    /*
     * A CUSTOM step's uploads live under its own slug in `stepData`, not in the
     * four columns above. Without this the client returns to the step, sees an
     * empty uploader, and is asked for a document the server already holds —
     * the upload twin of the empty-answers bug `savedAnswersFor` fixed.
     */
    for (const key of uploadedCustomFields(data?.stepData)) uploads[key] = true;
    if (uploads['selfie']) setSelfieUploaded(true);
    setUploadsState(uploads);
    writeUploadsDraft(uploads);
    /*
     * `configQuery.data` is read above (to map a stored docType back to its
     * configured label), so it belongs here — and both are react-query results,
     * whose object identity is stable between refetches. That matters: an
     * unstable dependency in an effect that calls `setState` re-runs on every
     * render, which is how the KYC redirect loop happened on `/kyc`.
     */
  }, [statusQuery.data, configQuery.data, stepConfigs, stepNumber]);

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
        /*
         * `undefined`, never `'multipart/form-data'` — the exact thing
         * `lib/api/account.ts` records as a mistake, made here anyway.
         *
         * A multipart body needs a `boundary` parameter that only the browser
         * knows. Naming the type by hand emits the header WITHOUT one, and the
         * server cannot parse the body. Deleting the header lets the browser
         * write both halves; the axios instance's default JSON content type is
         * what has to be got out of the way.
         *
         * This is the identity-document upload, so the failure it produces is a
         * client who cannot complete KYC — and the request looks correct in the
         * network tab, which is why it survived.
         */
        headers: { 'Content-Type': undefined },
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
        const missing = missingRequiredParts(currentStepConfig, formData, uploadsState);
        if (missing) {
          setError(
            // "Confirm it" when a photo is sitting there but was never
            // submitted, "upload one" when the slot is genuinely empty.
            pendingUploads[missing.slot]
              ? t('kyc.confirmChosenPhoto')
              : t('kyc.needUpload', { label: missing.label }),
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
        /*
         * The SAME check as the document step, because the rule is the same:
         * every required part of the chosen type must have arrived. It used to
         * be two hard-coded blocks naming `doc_front` and `address_proof`,
         * which is why a utility bill demanded a second page it does not have.
         */
        const missing = missingRequiredParts(currentStepConfig, formData, uploadsState);
        if (missing) {
          setError(
            pendingUploads[missing.slot]
              ? t('kyc.confirmChosenPhoto')
              : t('kyc.needUpload', { label: missing.label }),
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
        /*
         * The status cache MUST learn about the submit before the navigation.
         *
         * `/kyc/submitted` is behind a client-side route gate that decides from
         * the shared `['kyc-status']` query. A router.push keeps this page's
         * QueryClient, whose cached status still says `in_progress` (staleTime
         * 30s) — so the gate read yesterday's answer and bounced the client who
         * had JUST submitted straight back to step 1. Awaited, so the fresh
         * status is in the cache before the gate ever mounts.
         */
        await queryClient.invalidateQueries({ queryKey: keys.kyc.status() });
        router.push('/kyc/submitted');
        return;
      } else if (currentStepConfig) {
        /*
         * A step the BROKER added. Every branch above names a canonical slug, so
         * a custom step used to fall through all of them — unvalidated, and
         * never saved. `planCustomStep` records what that cost.
         */
        const plan = planCustomStep(currentStepConfig, formData, uploadsState);
        if (plan.missing) {
          const label = plan.missing.label;
          setError(plan.missingIsUpload ? t('kyc.needUpload', { label }) : t('kyc.requiredFields'));
          setLoading(false);
          return;
        }
        await api.post<{ message?: string }>('/kyc/step', { step: slug, data: plan.answers });
      }

      if (stepNumber < totalSteps) {
        router.push(`/kyc/step/${stepNumber + 1}`);
      } else {
        if (formData.firstName || formData.lastName) {
          await api.post<{ message?: string }>('/kyc/step', { step: 'personal', data: formData });
        }
        await api.post<{ message?: string }>('/kyc/submit');
        // Same reasoning as the review branch above: the gate must not decide
        // from a pre-submit cache entry.
        await queryClient.invalidateQueries({ queryKey: keys.kyc.status() });
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
          <Spinner size="lg" className="text-link" />
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
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={rejectedFields}
        storedDocValues={storedDocValues}
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
