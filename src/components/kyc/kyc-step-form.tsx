'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { forgetEdits, forgetSaved, readPersonalDraft, rememberEdit } from '@/lib/kyc-draft';
import { useResource } from '@/hooks/use-resource';
import { withReviewStep } from './review-step';
import { chosenDocumentValue, savedDocumentChoices, storedDocValuesOf } from './doc-type';
import { firstOwed, owedMessage } from './owed-message';
import {
  effectiveUploads,
  flagsSettledByUpload,
  outstandingFlags,
  storedFilesOf,
  type SessionUploads,
} from './upload-state';
import { isNetworkError, kycErrorMessage } from './kyc-errors';
import { continueAnswers, useStepAutosave } from './use-step-autosave';
import { ReturnedBanner, StepLoadError, StepLoading } from './step-screens';
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
  /** The server's sentence per field, from the last Continue. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** The form holds what the server has — autosave may start (`useStepAutosave`). */
  const [seeded, setSeeded] = useState(false);

  // What the client types is remembered until the server holds it (`kyc-draft.ts`).
  const set = (k: string, v: string) => {
    setFormData((p) => ({ ...p, [k]: v }));
    rememberEdit(k, v);
    // An edit answers the server's sentence about that field.
    setFieldErrors((p) => {
      if (!(k in p)) return p;
      const { [k]: _answered, ...rest } = p;
      return rest;
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
    const ready = statusQuery.status === 'ready' && configQuery.status === 'ready';
    // The saved document types join the form as the CHOICE each document step
    // opens on — a returning client seeing no card selected above their own
    // uploaded document is how they end up re-picking and re-uploading it.
    const onFile = savedDocumentChoices(status, configQuery.data ?? []);
    /*
     * And when the step OPENS, the document on file beats a card that was
     * clicked and never uploaded. The draft kept "Passport" after a national ID
     * had been sent, so the review listed a passport as missing (reported from
     * local testing). A click made after that wins, as it should.
     */
    if (ready && !seeded) {
      const draft = readPersonalDraft();
      forgetEdits(Object.keys(onFile).filter((key) => key in draft && draft[key] !== onFile[key]));
    }
    // Only UNSAVED edits come from the draft, so the server's answers show
    // wherever the client has not typed since.
    const merged = { ...storedAnswers, ...onFile, ...readPersonalDraft() };
    if (Object.keys(merged).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
      setFormData(merged);
    }
    if (ready) setSeeded(true);
  }, [status, configQuery.data, storedAnswers, statusQuery.status, configQuery.status, seeded]);

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
   * Typed answers save as the client types — `use-step-autosave.ts` has the
   * report that made it necessary — on EVERY step, since a built-in step may
   * carry a broker's extra questions too. Files are saved by their uploads;
   * the review screen collects nothing.
   */
  const refreshStatus = useCallback(
    (saved: Record<string, string>) => {
      forgetSaved(saved);
      void queryClient.invalidateQueries({ queryKey: keys.kyc.status() });
    },
    [queryClient],
  );
  const autosave = useStepAutosave({
    step: currentStepConfig?.slug === 'review' ? undefined : currentStepConfig,
    formData,
    saved: storedAnswers,
    ready: seeded,
    onSaved: refreshStatus,
  });

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

  /*
   * Save, then ask the SERVER whether the step is done — never decide it here.
   *
   * This validated with its own copy of the rules and saved only what passed,
   * while `submit` judged with another copy; every drift between the two
   * reached a client as Continue letting them through and the last screen
   * refusing (reported from local testing). Now every step is saved as it
   * stands and the answer carries the server's verdict on it
   * (`kyc-step-state.ts`) — the same judgement `submit` applies. The only thing
   * decided here is the one only this browser knows: a photo chosen and not yet
   * confirmed (`owedMessage`).
   */
  const handleNext = async () => {
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const slug = currentStepConfig?.slug || 'personal';
      if (slug === 'review') {
        /*
         * No re-post of the form as the personal step. It used to send the
         * WHOLE form — document choices, every custom step's answers, uploads
         * stringified to "[object Object]" — and the reviewer read all of it
         * beside the client's name. The review screen only submits.
         */
        await submit();
        return;
      }
      if (!currentStepConfig) return;

      // Anything typed in the last moment is saved first, so it is judged too.
      await autosave.flush();
      // The identity only where the client edited it — see `continueAnswers`.
      const data = continueAnswers(
        currentStepConfig,
        formData,
        new Set(Object.keys(readPersonalDraft())),
      );
      // The document the client is presenting — judged, and never allowed to
      // relabel pages that belong to another one (`saveStep`).
      if (slug === 'document') data.docType = docType;
      if (slug === 'address') data.docType = addressDocType;
      const saved = await api.post<KycStatusDto>('/kyc/step', { step: slug, data });
      forgetSaved(data);
      void queryClient.invalidateQueries({ queryKey: keys.kyc.status() });

      const owed = firstOwed(saved.data.steps?.find((state) => state.slug === slug));
      if (owed) {
        setError(owedMessage(owed, pendingUploads));
        return;
      }
      if (stepNumber < totalSteps) router.push(`/kyc/step/${stepNumber + 1}`);
      else await submit();
    } catch (e: unknown) {
      setError(kycErrorMessage(e));
      setFieldErrors(apiFieldErrors(e));
    } finally {
      setLoading(false);
    }
  };

  // Fail loudly. Rendering the form with `stepConfigs` empty would show the user
  // an onboarding step with no fields and no explanation.
  if (loadError) {
    return (
      <StepLoadError
        message={loadError}
        onRetry={() => {
          void configQuery.refetch();
          void statusQuery.refetch();
        }}
      />
    );
  }
  if (fetchingInitialData) return <StepLoading />;

  return (
    // Fills the shell's content area (kyc-shell.css), so the bar below can sit
    // at its bottom — `gap`, not `space-y`, so its `mt-auto` is not overridden.
    <div className="flex flex-1 flex-col gap-8">
      <ReturnedBanner status={status} />

      <DynamicStepRenderer
        currentStepConfig={currentStepConfig}
        allSteps={stepConfigs}
        formData={formData}
        uploadsState={uploadsState}
        selfieUploaded={selfieUploaded}
        rejectedFields={outstanding}
        storedFiles={stored}
        storedDocValues={storedDocValues}
        status={status}
        onChange={set}
        onUpload={handleUpload}
        onPendingChange={handlePendingChange}
        fieldErrors={fieldErrors}
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in-0"
        >
          {error}
        </div>
      )}

      {/*
        BACK / CONTINUE, AT THE BOTTOM OF THE PAGE on every step (owner, 26 Sep
        2026). It followed the step's last field, so it jumped up and down the
        screen from one step to the next — a short document step put it
        mid-page, a long personal step pushed it off the bottom. Now a short step
        leaves it on the bottom edge (`mt-auto` in a column that fills the
        screen) and a long one keeps it there while the fields scroll under it
        (`sticky`, with the page's own background so nothing shows through —
        and `-mx-5 px-5`, the content column's own padding, so the edges of the
        fields scrolling under it are covered too).
      */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {stepNumber > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              // Whatever is typed here is saved before the step is left.
              void autosave.flush().then(() => router.push(`/kyc/step/${stepNumber - 1}`))
            }
            disabled={loading}
          >
            {t('common.back')}
          </Button>
        ) : (
          <div />
        )}

        {autosave.state !== 'idle' && (
          <span aria-live="polite" className="text-[11px] text-muted-foreground">
            {t(
              autosave.state === 'saving'
                ? 'kyc.autosaveSaving'
                : autosave.state === 'saved'
                  ? 'kyc.autosaveSaved'
                  : 'kyc.autosaveFailed',
            )}
            {/* Nothing retries on its own until the next change, so the way
                to try again is right beside the sentence saying it failed. */}
            {autosave.state === 'failed' && (
              <button
                type="button"
                onClick={() => void autosave.flush()}
                className="ms-1.5 rounded-sm font-semibold text-link hover:underline focus-outline"
              >
                {t('kyc.autosaveRetry')}
              </button>
            )}
          </span>
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
