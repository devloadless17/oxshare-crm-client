'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { AsyncBoundary } from '@/components/async-boundary';
import { clearKycDraft } from '@/lib/kyc-draft';

type KycStatusDto = components['schemas']['KycStatusDto'];

export default function KycSubmittedPage() {
  /*
   * Reaching this screen means the server has the submission, so the copy in
   * this tab is redundant — and a redundant copy of someone's date of birth and
   * address is personal data retained for no purpose. Cleared on mount rather
   * than at submit time so it also covers a client who navigates back here.
   *
   * Not in an effect body that depends on the query: the draft should go
   * whether or not the status request succeeds.
   */
  useEffect(() => {
    clearKycDraft();
  }, []);

  /*
   * On useResource rather than useEffect, and no longer swallowing failures.
   *
   * This used `useState('submitted')` seeded optimistically plus
   * `.catch(() => {})`, so a failed request left the screen confidently telling
   * the client their KYC was submitted and under review when no request had
   * succeeded. On a compliance screen, "we don't know" and "submitted" are not
   * the same thing.
   */
  const statusQuery = useResource(
    ['kyc-status'],
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  const status = statusQuery.data?.status ?? 'submitted';
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';

  return (
    <AsyncBoundary
      status={statusQuery.status}
      label="Loading your verification status"
      endpoints={['GET /kyc/status']}
      onRetry={() => statusQuery.refetch()}
      errorMessage={apiErrorMessage(statusQuery.error, 'Could not load your verification status.')}
    >
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-lg mx-auto py-12 px-4 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Icon Badge */}
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full border-4 shadow-lg ${
            isApproved
              ? 'bg-success/10 border-success/30 text-success shadow-success/20'
              : isRejected
                ? 'bg-destructive/10 border-destructive/30 text-destructive shadow-destructive/20'
                : 'bg-info/10 border-info/30 text-info shadow-info/20'
          }`}
        >
          {isApproved ? (
            <CheckCircle2 className="h-12 w-12" />
          ) : isRejected ? (
            <XCircle className="h-12 w-12" />
          ) : (
            <Clock className="h-12 w-12 animate-pulse" />
          )}
        </div>

        {/* Main Status Text */}
        <div className="space-y-2 max-w-md">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
            {isApproved
              ? 'KYC Approved!'
              : isRejected
                ? 'KYC Verification Rejected'
                : 'Verification Submitted'}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
            {isApproved
              ? 'Your identity has been verified successfully. You now have full access to trading accounts and features.'
              : isRejected
                ? 'Your KYC documents were not approved. Please review the requirements and re-submit your verification.'
                : "Your documents have been received and are currently under compliance review. This process usually takes 1–2 business days. We'll update your account status once review is complete."}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center bg-primary hover:bg-primary-hover text-primary-foreground font-bold px-8 py-3.5 rounded-full text-xs shadow-sm shadow-primary/25 focus-outline cursor-pointer"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </AsyncBoundary>
  );
}
