'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';

type KycStatusDto = components['schemas']['KycStatusDto'];

export default function KycPage() {
  const router = useRouter();

  /*
   * This screen's whole job is to resume the client at the right step, so the
   * fetch is a query and the NAVIGATION is the effect — which is what an effect is
   * legitimately for. react-query owns cancellation, so the old `isMounted` flag
   * is gone.
   */
  const statusQuery = useResource(
    ['kyc-status'],
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  useEffect(() => {
    if (statusQuery.status === 'loading') return;

    // A failed status read must not strand the client on a spinner. Step 1 is a
    // safe destination: the steps are resumable and already-saved data comes back
    // from the server when that page loads.
    if (statusQuery.status === 'error' || statusQuery.status === 'unavailable') {
      router.replace('/kyc/step/1');
      return;
    }

    const data = statusQuery.data;
    if (
      data?.status === 'submitted' ||
      data?.status === 'under_review' ||
      data?.status === 'approved'
    ) {
      router.replace('/kyc/submitted');
      return;
    }

    // Open the first step the client has not completed.
    let targetStep = 1;
    if (data?.personalInfo?.firstName && data?.personalInfo?.lastName) {
      targetStep = 2;
      if (data?.document?.frontFilePath) {
        targetStep = 3;
        if (data?.selfie?.filePath) {
          targetStep = 4;
          if (data?.addressProof?.filePath) {
            targetStep = 5;
          }
        }
      }
    }
    router.replace(`/kyc/step/${targetStep}`);
  }, [statusQuery.status, statusQuery.data, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center space-y-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-link border border-primary/20">
        <ShieldCheck className="h-8 w-8 text-link" />
        <Spinner size="xl" className="absolute text-primary/40" />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">{t('kyc.resumingTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('kyc.resumingBody')}</p>
      </div>
    </div>
  );
}
