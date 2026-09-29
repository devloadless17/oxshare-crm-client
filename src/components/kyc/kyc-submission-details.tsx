'use client';

import { useMemo, useState } from 'react';
import { Eye, FileText, User } from 'lucide-react';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { DataTable, type Column } from '@/components/data-table';
import { DocLightbox } from './doc-lightbox';
import {
  kycDocumentState,
  kycDocumentsOf,
  personalDetailsOf,
  type KycDocumentRow,
  type KycDocumentState,
  type KycStatusLike,
} from '@/lib/kyc-documents';
import { t, type MessageKey } from '@/lib/i18n';
import { isProfileKey } from '@/lib/profile';
import { keys } from '@/lib/query-keys';

type KycStatusDto = components['schemas']['KycStatusDto'];
type KycStepConfigDto = components['schemas']['KycStepConfigDto'];

/**
 * What the client submitted for verification: their details and every document,
 * each with its own state and a full-screen viewer.
 *
 * Shared by the KYC outcome screen and `/profile`, so the two cannot describe
 * the same submission differently.
 *
 * ## The config is read for LABELS only
 *
 * `/kyc/config` names the documents the way the broker does ("Passport", "Front
 * side"). It is optional here: a failure falls back to generic labels rather
 * than hiding the client's own documents behind a request that is only
 * decoration. The status — the thing being shown — is the caller's, already
 * loaded and already error-handled.
 *
 * ## Dates are the SUBMISSION's
 *
 * Nothing stores when an individual file was uploaded or reviewed: a
 * submission is sent as a whole and decided as a whole. So "Submitted" is the
 * submission's `submittedAt` and "Reviewed" its `reviewedAt`, and an undecided
 * row shows a dash rather than a date that would imply a decision.
 */
export function KycSubmissionDetails({
  status,
  showPersonal = true,
  hideProfile = false,
}: {
  status: KycStatusDto;
  showPersonal?: boolean;
  /**
   * Leave out the PROFILE's fields and show only a broker's own questions —
   * for `/profile`, which shows the profile itself above this. The personal
   * answers ARE the profile's values (backend 0139), so listing them twice on
   * one page is one record printed twice, and it reads as two records that
   * could disagree — which is exactly what they used to be.
   */
  hideProfile?: boolean;
}) {
  const configQuery = useResource(
    keys.kyc.config(),
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
  );
  const steps = useMemo(() => configQuery.data ?? [], [configQuery.data]);

  const statusLike = status as KycStatusLike;
  const documents = useMemo(() => kycDocumentsOf(statusLike, steps), [statusLike, steps]);
  const personal = useMemo(
    () =>
      personalDetailsOf(status.personalInfo, steps).filter(
        (item) => !hideProfile || !isProfileKey(item.key),
      ),
    [status.personalInfo, steps, hideProfile],
  );

  const [viewing, setViewing] = useState<number | null>(null);
  const lightboxDocs = useMemo(
    () =>
      documents.map((d) => ({
        filePath: d.filePath,
        label: d.part ? `${d.type} · ${d.part}` : d.type,
      })),
    [documents],
  );

  const decided = status.status === 'approved' || status.status === 'rejected';
  const submittedAt = formatDateTime(status.submittedAt);
  const reviewedAt = decided ? formatDateTime(status.reviewedAt) : '—';

  const columns: Column<KycDocumentRow>[] = [
    {
      header: t('kyc.docs.colDocument'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {row.type}
            {row.part && <span className="font-normal text-muted-foreground"> · {row.part}</span>}
          </p>
        </div>
      ),
    },
    {
      header: t('kyc.docs.colSubmitted'),
      cell: () => <span className="whitespace-nowrap">{submittedAt}</span>,
    },
    {
      header: t('kyc.docs.colReviewed'),
      cell: () => <span className="whitespace-nowrap">{reviewedAt}</span>,
    },
    {
      header: t('kyc.docs.colStatus'),
      cell: (row) => (
        <DocumentStateBadge
          state={kycDocumentState(row, status.status, status.rejectedFields ?? [])}
        />
      ),
    },
    {
      header: t('kyc.docs.colView'),
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setViewing(documents.indexOf(row))}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-link hover:bg-muted focus-outline"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {t('kyc.docs.view')}
        </button>
      ),
    },
  ];

  return (
    <div className="w-full space-y-4 text-start">
      {showPersonal && personal.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            <User className="h-4 w-4 text-link" aria-hidden="true" />
            {t('kyc.docs.personalTitle')}
          </h2>
          <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {personal.map((item) => (
              <div key={item.key} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </dt>
                <dd
                  className={`mt-1 truncate text-sm ${
                    (status.rejectedFields ?? []).includes(item.key)
                      ? 'font-semibold text-destructive'
                      : 'text-foreground'
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-link" aria-hidden="true" />
          {t('kyc.docs.title')}
        </h2>
        <DataTable
          caption={t('kyc.docs.title')}
          columns={columns}
          rows={documents}
          rowKey={(row) => row.key}
          empty={
            <p className="p-6 text-center text-xs text-muted-foreground">{t('kyc.docs.empty')}</p>
          }
        />
      </section>

      {viewing !== null && (
        <DocLightbox
          docs={lightboxDocs}
          index={viewing}
          onClose={() => setViewing(null)}
          onNavigate={setViewing}
        />
      )}
    </div>
  );
}

const STATE_STYLE: Record<KycDocumentState, { key: MessageKey; className: string }> = {
  approved: { key: 'kyc.docs.stateApproved', className: 'bg-success/15 text-success' },
  accepted: { key: 'kyc.docs.stateAccepted', className: 'bg-success/15 text-success' },
  rejected: { key: 'kyc.docs.stateRejected', className: 'bg-destructive/15 text-destructive' },
  in_review: { key: 'kyc.docs.stateInReview', className: 'bg-info/15 text-info' },
  not_submitted: { key: 'kyc.docs.stateNotSubmitted', className: 'bg-muted text-muted-foreground' },
};

function DocumentStateBadge({ state }: { state: KycDocumentState }) {
  const style = STATE_STYLE[state];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style.className}`}
    >
      {t(style.key)}
    </span>
  );
}

/** Browser locale, like the profile's other dates — these are the client's own. */
function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
