'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, Clock, XCircle } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { ApplyPanel } from '@/components/partner/apply-panel';
import { ApprovedPanel } from '@/components/partner/partner-workspace';
import { useResource } from '@/hooks/use-resource';
import { Button } from '@/components/ui/button';
import { partnerApi, type IbStatus } from '@/lib/api/partner';
import { intlLocale, localized, t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

export default function PartnerPage() {
  const query = useResource<IbStatus>(keys.partner.status(), (signal) => partnerApi.status(signal));

  return (
    <div className="flex w-full flex-1 flex-col">
      <AsyncBoundary
        status={query.status}
        label={t('partner.loading')}
        endpoints={['GET /ib/status']}
        onRetry={() => query.refetch()}
        errorMessage={t('partner.loadFailed')}
        error={query.error}
        fill
      >
        {query.data ? (
          <PartnerState status={query.data} onChanged={() => void query.refetch()} />
        ) : null}
      </AsyncBoundary>
    </div>
  );
}

function PartnerState({ status, onChanged }: { status: IbStatus; onChanged: () => void }) {
  if (status.account) return <ApprovedPanel account={status.account} />;

  const application = status.application;

  if (application?.status === 'pending')
    return (
      <PendingPanel
        submittedAt={application.submittedAt}
        agencyName={
          application.agencyName
            ? localized(application.agencyName, application.agencyNameAr)
            : null
        }
      />
    );

  if (application?.status === 'rejected') {
    return (
      <RejectedPanel
        reason={
          application.rejectionReason
            ? localized(application.rejectionReason, application.rejectionReasonAr)
            : null
        }
        onReapply={onChanged}
      />
    );
  }

  if (!status.eligible) return <IneligiblePanel reason={status.ineligibleReason} />;

  return <ApplyPanel onApplied={onChanged} />;
}

function PendingPanel({
  submittedAt,
  agencyName,
}: {
  submittedAt: string;
  agencyName: string | null;
}) {
  const footnote = agencyName
    ? t('partner.pendingSubmittedFor', { date: formatDate(submittedAt), agency: agencyName })
    : t('partner.pendingSubmitted', { date: formatDate(submittedAt) });

  return (
    <StatusPanel
      icon={Clock}
      tone="warning"
      heading={t('partner.pendingHeading')}
      body={t('partner.pendingBody')}
      footnote={footnote}
    />
  );
}

function RejectedPanel({ reason, onReapply }: { reason: string | null; onReapply: () => void }) {
  const [reapplying, setReapplying] = React.useState(false);

  if (reapplying) return <ApplyPanel onApplied={onReapply} />;

  return (
    <div className="space-y-4">
      <StatusPanel
        icon={XCircle}
        tone="destructive"
        heading={t('partner.rejectedHeading')}
        body={t('partner.rejectedReapply')}
      >
        {reason && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-start">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('partner.rejectedReasonLabel')}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{reason}</p>
          </div>
        )}
      </StatusPanel>

      <div className="flex justify-center">
        <Button type="button" onClick={() => setReapplying(true)}>
          {t('partner.reapply')}
        </Button>
      </div>
    </div>
  );
}

function IneligiblePanel({ reason }: { reason: string | null }) {
  // The one gate is verification (13 Oct 2026), so the way forward is always
  // the KYC wizard. The body stays the API's own sentence.
  return (
    <StatusPanel
      icon={ShieldCheck}
      tone="muted"
      heading={t('partner.ineligibleHeading')}
      body={reason ?? ''}
    >
      <div className="mt-5 flex justify-center">
        <Button asChild>
          <Link href="/kyc">{t('partner.verifyNow')}</Link>
        </Button>
      </div>
    </StatusPanel>
  );
}

const TONES = {
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
} as const;

function StatusPanel({
  icon: Icon,
  tone,
  heading,
  body,
  footnote,
  children,
}: {
  icon: React.ElementType;
  tone: keyof typeof TONES;
  heading: string;
  body: string;
  footnote?: string;
  children?: React.ReactNode;
}) {
  return (
    // `flex-1` + centred, so the panel TAKES THE FRAME rather than sitting as a
    // short card with dead space under it. `AsyncBoundary fill` already gives
    // this a bounded flex column to stretch inside; without the flex-1 the card
    // measured its own content and left most of the screen empty.
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
      <span
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 ${TONES[tone]}`}
      >
        <Icon className="h-8 w-8" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-semibold">{heading}</h2>
      {body && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {footnote && <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>}
      {children}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(intlLocale());
}
