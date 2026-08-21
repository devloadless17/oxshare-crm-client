'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/loader';
import { useKycAccess } from '@/hooks/use-kyc-access';
import type { KycStatus } from '@/lib/kyc-form-access';
import { t } from '@/lib/i18n';

/**
 * `/kyc` is a signpost, not a screen — it decides where the client belongs and
 * sends them there.
 *
 * One rule, shared with the two routes it points at: `canOpenKycForm`. Anything
 * other than an unfinished submission goes to the terminal screen (`rejected`
 * included — they need the reason and the returned-field list before editing;
 * the re-apply button there is what opens the form), and the rest to step 1.
 * The step route and the outcome route gate on the same predicate, so the
 * three cannot disagree about where somebody belongs — which is the property
 * that once failed and produced a redirect loop.
 *
 * Decided in the BROWSER, from the status the portal already has in its query
 * cache. See components/kyc/kyc-route-gate.tsx for why the server-side read
 * this used to do could not work off localhost.
 */
export default function KycPage() {
  const router = useRouter();
  const { status, isLoading } = useKycAccess();

  useEffect(() => {
    if (isLoading) return;
    const resolved: KycStatus = status ?? 'not_started';
    const unfinished = resolved === 'not_started' || resolved === 'in_progress';
    // `rejected` may open the form, but goes to the outcome screen first.
    router.replace(unfinished ? '/kyc/step/1' : '/kyc/submitted');
  }, [isLoading, status, router]);

  return <PageLoader label={t('kyc.resuming')} />;
}
