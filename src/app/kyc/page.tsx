'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/loader';
import { AsyncBoundary } from '@/components/async-boundary';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { useResource } from '@/hooks/use-resource';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import type { KycStatus } from '@/lib/kyc-form-access';
import { withReviewStep } from '@/components/kyc/review-step';
import { resumeStepNumber } from '@/components/kyc/resume-step';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

type KycStepConfigDto = components['schemas']['KycStepConfigDto'];
type KycStatusDto = components['schemas']['KycStatusDto'];

/**
 * `/kyc` is a signpost, not a screen — it decides where the client belongs and
 * sends them there.
 *
 * One rule, shared with the two routes it points at: `canOpenKycForm`. Anything
 * other than an unfinished submission goes to the terminal screen (`rejected`
 * included — they need the reason and the returned-field list before editing;
 * the re-apply button there is what opens the form). The step route and the
 * outcome route gate on the same predicate, so the three cannot disagree about
 * where somebody belongs — which is the property that once failed and produced
 * a redirect loop.
 *
 * ## An unfinished client RESUMES — reported from production
 *
 * This sent every unfinished client to step 1, so somebody who had filled in
 * four steps and left came back to their own name and date of birth and had to
 * press Continue through every screen to find where they stopped. They now land
 * on the first step that is not complete (`resume-step.ts`), judged from what
 * the server holds.
 *
 * Decided in the BROWSER, from the status the portal already has in its query
 * cache. See components/kyc/kyc-route-gate.tsx for why the server-side read
 * this used to do could not work off localhost.
 */
export default function KycPage() {
  const router = useRouter();
  const { status, isLoading } = useKycAccess();
  const resolved: KycStatus = status ?? 'not_started';
  const unfinished = !isLoading && (resolved === 'not_started' || resolved === 'in_progress');

  // Same keys as the wizard, so these are the requests it would make anyway.
  const config = useResource(
    keys.kyc.config(),
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
    { enabled: unfinished },
  );
  const detail = useResource(
    keys.kyc.status(),
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
    { enabled: unfinished },
  );

  useEffect(() => {
    if (isLoading) return;
    if (!unfinished) {
      // `rejected` may open the form, but goes to the outcome screen first.
      router.replace('/kyc/submitted');
      return;
    }
    // Only on a real answer: a failure is shown below, with a retry.
    if (config.status !== 'ready' || detail.status !== 'ready') return;
    const step = resumeStepNumber(detail.data ?? null, withReviewStep(config.data ?? []));
    router.replace(`/kyc/step/${step}`);
  }, [isLoading, unfinished, config.status, config.data, detail.status, detail.data, router]);

  /*
   * A failure is SAID, with a retry — not answered by guessing step 1. Nothing
   * can be resumed without the configuration and the saved answers, and a
   * client sent to the start of a form they finished yesterday would reasonably
   * conclude it had been lost.
   */
  const failed = unfinished
    ? [config, detail].find((q) => q.status !== 'loading' && q.status !== 'ready')
    : undefined;
  if (failed) {
    return (
      <AsyncBoundary
        status={failed.status}
        label={t('kyc.resuming')}
        endpoints={['GET /kyc/config', 'GET /kyc/status']}
        onRetry={() => {
          void config.refetch();
          void detail.refetch();
        }}
        errorMessage={t('kyc.loadFailed')}
        error={failed.error}
      >
        {null}
      </AsyncBoundary>
    );
  }

  return <PageLoader label={t('kyc.resuming')} />;
}
