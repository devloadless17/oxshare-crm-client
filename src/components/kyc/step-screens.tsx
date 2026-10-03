'use client';

import { AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { localized, t } from '@/lib/i18n';

/*
 * The KYC step form's states that are not the form — moved out of
 * `kyc-step-form.tsx`, which is held under its `max-lines` cap by a ratchet
 * that only goes down.
 */

/**
 * A failed load, said loudly with a retry. Rendering the form with no
 * configuration would show an onboarding step with no fields and no reason.
 */
export function StepLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
        <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

export function StepLoading() {
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

/**
 * The reviewer's reason, while a returned submission is being corrected.
 *
 * Shown for a correction round, not only the `rejected` state: saving any step
 * moves a returned submission to `in_progress`, and the banner used to vanish
 * with it — taking the reason out of sight of the person fixing it. The reason
 * stays on the submission until it is resubmitted.
 */
export function ReturnedBanner({
  status,
}: {
  status: {
    status?: string;
    rejectionReason?: string;
    rejectionReasonAr?: string | null;
    reverificationRequestedAt?: string;
  } | null;
}) {
  const returned =
    status?.status === 'rejected' ||
    (status?.status === 'in_progress' && Boolean(status.rejectionReason));
  if (!returned) return null;
  /*
   * A VERIFIED client asked to update is not a client whose application was
   * refused (26 Sep 2026): a detail changed — a new passport, a move — and the
   * broker needs it verified again. "Returned for correction" reads as a
   * verdict on somebody who did nothing wrong.
   */
  const reverify = Boolean(status?.reverificationRequestedAt);
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-1.5 animate-in fade-in-0">
      <div className="flex items-center gap-2 font-bold text-destructive text-sm">
        <span>{reverify ? t('kyc.reverifyTitle') : t('kyc.actionRequired')}</span>
      </div>
      {status?.rejectionReason && (
        <p className="text-destructive text-xs">
          <strong className="font-semibold text-destructive">
            {reverify ? t('kyc.reverifyWhy') : t('kyc.rejectionNote')}
          </strong>{' '}
          {localized(status.rejectionReason, status.rejectionReasonAr)}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground pt-1">{t('kyc.updateHighlighted')}</p>
    </div>
  );
}
