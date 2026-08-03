'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';

export default function KycPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    api.get('/kyc/status')
      .then((res) => {
        if (!isMounted) return;
        const data = res.data;

        // If already submitted, under review, or approved
        if (data.status === 'submitted' || data.status === 'under_review' || data.status === 'approved') {
          router.replace('/kyc/submitted');
          return;
        }

        // Determine last completed step and open next required step
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
      })
      .catch(() => {
        if (isMounted) {
          setError('Failed to load verification status. Redirecting...');
          setTimeout(() => router.replace('/kyc/step/1'), 1500);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center space-y-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-link border border-primary/20 shadow-sm">
        <ShieldCheck className="h-8 w-8 text-link" />
        <Loader2 className="absolute h-14 w-14 animate-spin text-primary/40" />
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">Resuming Identity Verification</h2>
        <p className="text-xs text-muted-foreground">Fetching your progress and loading your last active step...</p>
      </div>

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}
