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
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

type KycStatusDto = components['schemas']['KycStatusDto'];

export function KycOutcome() {
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
    keys.kyc.status(),
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  /*
   * No `?? 'submitted'` default. A 200 with a null body is the documented
   * answer for a client who never started, and defaulting it to "submitted"
   * told exactly that person their documents were under review. The route gate
   * sends them to the form; until the status has landed this renders nothing.
   */
  const status = statusQuery.data?.status ?? null;
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const rejectionReason = statusQuery.data?.rejectionReason ?? '';
  const rejectedFields = statusQuery.data?.rejectedFields ?? [];

  return (
    <AsyncBoundary
      status={statusQuery.status}
      label={t('common.loading')}
      endpoints={['GET /kyc/status']}
      onRetry={() => statusQuery.refetch()}
      errorMessage={apiErrorMessage(statusQuery.error, t('kyc.statusLoadFailed'))}
      error={statusQuery.error}
    >
      {status !== null && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] h-full text-center space-y-6 max-w-lg mx-auto py-12 px-4 animate-in fade-in-0 zoom-in-95 duration-200">
          {/* Icon Badge */}
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-full border-4 ${
              isApproved
                ? 'bg-success/10 border-success/30 text-success'
                : isRejected
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-info/10 border-info/30 text-info'
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
                ? t('kyc.approvedTitle')
                : isRejected
                  ? t('kyc.rejectedTitle')
                  : t('kyc.submittedTitle')}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
              {isApproved
                ? t('kyc.approvedBody')
                : isRejected
                  ? t('kyc.rejectedBody')
                  : t('kyc.submittedBody')}
            </p>
          </div>

          {/*
           * WHY it was rejected, and WHICH fields.
           *
           * The screen said "please review the requirements and re-submit" and
           * named neither — so a client had to guess, resubmit the same
           * documents, and be rejected again. Both values are on /kyc/status and
           * were simply never rendered.
           */}
          {isRejected && (rejectionReason || rejectedFields.length > 0) && (
            <div className="w-full space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-start">
              {rejectionReason && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">
                    {t('kyc.rejectionReasonLabel')}
                  </p>
                  <p className="text-xs text-foreground">{rejectionReason}</p>
                </div>
              )}
              {rejectedFields.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">
                    {t('kyc.rejectedFieldsLabel')}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {rejectedFields.map((field) => (
                      <li
                        key={field}
                        className="rounded-md border border-destructive/30 bg-background px-2 py-0.5 text-[11px] font-medium"
                      >
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            {/*
             * THE WAY BACK IN. A rejected client with no route to the form is
             * stuck: the API accepts their edits — `saveStep` refuses only
             * approved and in-review submissions — so the only thing stopping
             * them was this screen having no button.
             */}
            {isRejected && (
              <Link
                href="/kyc/step/1"
                className="inline-flex items-center justify-center bg-primary hover:bg-primary-hover text-primary-foreground font-bold px-8 py-3.5 rounded-full text-xs focus-outline cursor-pointer"
              >
                {t('kyc.reapply')}
              </Link>
            )}
            <Link
              href="/dashboard"
              className={`inline-flex items-center justify-center font-bold px-8 py-3.5 rounded-full text-xs focus-outline cursor-pointer ${
                isRejected
                  ? 'border border-border text-foreground hover:bg-muted'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
              }`}
            >
              {t('kyc.backToDashboard')}
            </Link>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
