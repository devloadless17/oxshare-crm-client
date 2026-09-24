'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { readPersonalDraft, writePersonalDraft } from '@/lib/kyc-draft';
import { useResource } from '@/hooks/use-resource';
import { withReviewStep } from './review-step';
import {
  chosenDocumentValue,
  missingRequiredParts,
  savedDocumentChoices,
  storedDocValuesOf,
} from './doc-type';
import { planCustomStep } from './custom-step';
import {
  effectiveUploads,
  flagsSettledByUpload,
  outstandingFlags,
  storedFilesOf,
  type SessionUploads,
} from './upload-state';
import { isNetworkError, kycErrorMessage } from './kyc-errors';
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
   * Files chosen but not yet confirmed.
   *
   * Kept apart from what actually reached the server. The two together are
   * what let this step say something true: a client looking at their own photo
   * was told "please upload your proof of address", because from here a pending
   * preview and an empty tile are the same thing — and working out that
   * "Use this" was the missing step cost real time.
   */
  const [pendingUploads, setPendingUploads] = useState<Record<string, boolean>>({});
  const handlePendingChange = useCallback((field: string, hasPending: boolean) => {
    setPendingUploads((prev) =>
      prev[field] === hasPending ? prev : { ...prev, [field]: hasPending },
    );
  }, []);

  /*
   * What THIS session uploaded, and for which document. The server's answer is
   * read from the status on every render (`upload-state.ts` says why the
   * sessionStorage copy of uploads was removed); this only adds what landed
   * since that status was fetched.
   */
  const [sessionUploads, setSessionUploads] = useState<SessionUploads>({});
  /** The reviewer's document flags this session has answered with a new upload. */
  const [settled, setSettled] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
   * `keys.kyc.config()` is the SAME key the kyc layout uses, so react-query
   * serves both from a single request.
   *
   * Neither query may be swallowed: without the config there are no fields,
   * and without the status we lose prefill and, worse, the rejection notice on
   * a returned KYC. A failure renders an error with a retry, never an empty form.
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

  // Always present, always last — see `withReviewStep`. Memoised so the effects
  // below do not see a new array identity on every render.
  const stepConfigs = useMemo(() => withReviewStep(configQuery.data ?? []), [configQuery.data]);
  const status = statusQuery.data ?? null;

  const docType = chosenDocumentValue(stepConfigs, formData, 'identity');
  const addressDocType = chosenDocumentValue(stepConfigs, formData, 'address');
  const storedDocValues = storedDocValuesOf(status);
  const stored = useMemo(() => storedFilesOf(status), [status]);
  const storedAnswers = useMemo(
    () => savedAnswersFor(status, stepConfigs, stepNumber),
    [status, stepConfigs, stepNumber],
  );

  /*
   * What the reviewer asked for that the client has not answered yet, and
   * which uploads count as done FOR THE DOCUMENT CHOSEN — see `upload-state.ts`
   * for the three production bugs these two lines replace.
   */
  const outstanding = outstandingFlags(status?.rejectedFields, settled, formData, storedAnswers);
  const uploadsState = effectiveUploads({
    stored,
    storedTypes: storedDocValues,
    session: sessionUploads,
    chosen: { identity: docType, address: addressDocType },
    outstanding,
    steps: stepConfigs,
  });
  const selfieUploaded = Boolean(uploadsState['selfie']);

  /*
   * Restores half-filled input from sessionStorage and folds in whatever the
   * server already has.
   *
   * The sessionStorage read is a deliberate exception to
   * react-hooks/set-state-in-effect: this IS the case the rule's own docs allow,
   * synchronising React state with an external system. A lazy useState
   * initialiser would read sessionStorage during render, which the server cannot
   * do, producing a hydration mismatch on a form the user has half-filled.
   *
   * Local edits win over the server copy — the client typed them more recently.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // The saved document types join the form as the CHOICE each document step
    // opens on — a returning client seeing no card selected above their own
    // uploaded document is how they end up re-picking and re-uploading it.
    const savedTypes = savedDocumentChoices(status, configQuery.data ?? []);
    const merged = { ...storedAnswers, ...savedTypes, ...readPersonalDraft() };
    if (Object.keys(merged).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
      setFormData(merged);
      writePersonalDraft(merged);
    }
  }, [status, configQuery.data, storedAnswers]);

  /*
   * Upload handler.
   *
   * `docType` names the document a canonical page belongs to, so the server
   * files it under the right one and starts the document afresh when the
   * client has switched — `attachFile` in the backend. `onProgress` is threaded
   * down so the uploader can show a determinate bar: a spinner reading "please
   * wait" is indistinguishable from a hung request on mobile data.
   */
  const handleUpload = useCallback(
    async (
      field: string,
      file: File,
      onProgress?: (percent: number) => void,
      uploadDocType?: string,
    ) => {
      setError('');
      const form = new FormData();
      form.append('file', file);
      form.append('field', field);
      if (uploadDocType) form.append('docType', uploadDocType);
      await api.post<{ message?: string }>('/kyc/upload', form, {
        /*
         * `undefined`, never `'multipart/form-data'`: a multipart body needs a
         * `boundary` parameter only the browser knows, and naming the type by
         * hand emits the header without one, so the server cannot parse it.
         */
        headers: { 'Content-Type': undefined },
        onUploadProgress: (e) => {
          // `total` is absent on some proxies; without it a percentage would be
          // a guess, so leave the bar where it is rather than inventing movement.
          if (onProgress && e.total) {
            onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          }
        },
      });

      setSessionUploads((p) => ({ ...p, [field]: { docType: uploadDocType } }));
      setSettled((p) => [...p, ...flagsSettledByUpload(field, stepConfigs)]);
      // The server now holds the page under its document; read that back.
      void queryClient.invalidateQueries({ queryKey: keys.kyc.status() });
    },
    [queryClient, stepConfigs],
  );

  const currentStepConfig =
    stepConfigs.find((s) => s.stepNumber === stepNumber) || stepConfigs[stepNumber - 1];

  const totalSteps = stepConfigs.length || 5;

  /*
   * Submit, and survive losing the ANSWER.
   *
   * A request that got no response may still have landed — the connection can
   * drop after the server committed. Reported from production as "network
   * error on submission". So a network failure asks the server what happened
   * before saying anything: if the submission is in, the client is where they
   * meant to be; only a genuine failure is reported, in words they can act on.
   */
  const submit = async () => {
    try {
      await api.post<{ message?: string }>('/kyc/submit');
    } catch (e: unknown) {
      if (!isNetworkError(e)) throw e;
      const now = await api
        .get<KycStatusDto | null>('/kyc/status')
        .then((r) => r.data?.status)
        .catch(() => undefined);
      if (now !== 'submitted' && now !== 'under_review') throw e;
    }
    /*
     * The status cache MUST learn about the submit before the navigation:
     * `/kyc/submitted` is gated on the shared status query, and a cached
     * `in_progress` bounced the client who had JUST submitted back to step 1.
     */
    await queryClient.invalidateQueries({ queryKey: keys.kyc.status() });
    router.push('/kyc/submitted');
  };

  /** Checks the step, and says what is missing; `true` when it may be saved. */
  const validate = (slug: string): boolean => {
    if (slug === 'document' || slug === 'address') {
      if (!(slug === 'document' ? docType : addressDocType)) {
        setError(t('kyc.chooseDocument'));
        return false;
      }
      const missing = missingRequiredParts(currentStepConfig, formData, uploadsState);
      if (missing) {
        // "Confirm it" when a photo is chosen but not sent, "upload one" when
        // the slot is genuinely empty.
        setError(
          pendingUploads[missing.slot]
            ? t('kyc.confirmChosenPhoto')
            : t('kyc.needUpload', { label: missing.label }),
        );
        return false;
      }
      return true;
    }
    if (slug === 'selfie') {
      if (!selfieUploaded) setError(t('kyc.needSelfie'));
      return selfieUploaded;
    }
    const plan = planCustomStep(currentStepConfig, formData, uploadsState);
    if (plan.missing) {
      const label = plan.missing.label;
      setError(
        plan.missingIsUpload ? t('kyc.needUpload', { label }) : t('kyc.fieldRequired', { label }),
      );
      return false;
    }
    if (plan.invalid) {
      setError(
        plan.invalid.reason === 'phone'
          ? t('kyc.phoneIncomplete', { label: plan.invalid.field.label })
          : t('kyc.tooYoung'),
      );
      return false;
    }
    return true;
  };

  /* Save step data and advance */
  const handleNext = async () => {
    setError('');
    setLoading(true);
    try {
      const slug = currentStepConfig?.slug || 'personal';
      if (slug !== 'review' && !validate(slug)) return;

      if (slug === 'review') {
        /*
         * No re-post of the form as the personal step. It used to send the
         * WHOLE form — document choices, every custom step's answers, uploads
         * stringified to "[object Object]" — and the reviewer read all of it
         * beside the client's name. Every step saved its own answers on
         * Continue; the review screen only submits them.
         */
        await submit();
        return;
      }

      if (slug === 'document' || slug === 'address') {
        await api.post('/kyc/step', {
          step: slug,
          data: { docType: slug === 'document' ? docType : addressDocType },
        });
      } else if (slug === 'selfie') {
        await api.post('/kyc/step', { step: 'selfie', data: {} });
      } else if (currentStepConfig) {
        /*
         * The personal step and every step the broker added share one rule:
         * the fields the CONFIGURATION names, validated by their type. The
         * personal step used to check a hard-coded list and accept "+961" as a
         * phone number; `planCustomStep` knows both.
         */
        const plan = planCustomStep(currentStepConfig, formData, uploadsState);
        await api.post('/kyc/step', { step: slug, data: plan.answers });
      }
      void queryClient.invalidateQueries({ queryKey: keys.kyc.status() });

      if (stepNumber < totalSteps) router.push(`/kyc/step/${stepNumber + 1}`);
      else await submit();
    } catch (e: unknown) {
      setError(kycErrorMessage(e));
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

  /*
   * A correction round, not only the `rejected` state: saving any step moves a
   * returned submission to `in_progress`, and the banner used to vanish with
   * it — taking the reviewer's reason out of sight of the person fixing it. The
   * reason stays on the submission until it is resubmitted.
   */
  const returned =
    status?.status === 'rejected' ||
    (status?.status === 'in_progress' && Boolean(status.rejectionReason));

  return (
    <div className="space-y-8">
      {returned && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-1.5 animate-in fade-in-0">
          <div className="flex items-center gap-2 font-bold text-destructive text-sm">
            <span>{t('kyc.actionRequired')}</span>
          </div>
          {status?.rejectionReason && (
            <p className="text-destructive text-xs">
              <strong className="font-semibold text-destructive">{t('kyc.rejectionNote')}</strong>{' '}
              {status.rejectionReason}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">{t('kyc.updateHighlighted')}</p>
        </div>
      )}

      <DynamicStepRenderer
        currentStepConfig={currentStepConfig}
        allSteps={stepConfigs}
        formData={formData}
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={outstanding}
        storedFiles={stored}
        onChange={set}
        onUpload={handleUpload}
        onPendingChange={handlePendingChange}
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in-0"
        >
          {error}
        </div>
      )}

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
