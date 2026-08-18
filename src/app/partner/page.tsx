'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Handshake, Network, ShieldCheck, Clock, XCircle } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { ApplyPanel } from '@/components/partner/apply-panel';
import { CommissionWallet } from '@/components/partner/commission-wallet';
import { PartnerDashboard } from '@/components/partner/partner-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbOverview, type IbStatus } from '@/lib/api/partner';
import { useUser } from '@/context/UserContext';
import { t } from '@/lib/i18n';

export default function PartnerPage() {
  const query = useResource<IbStatus>(['ib-status'], (signal) => partnerApi.status(signal));

  return (
    <div className="flex w-full flex-1 flex-col">
      <AsyncBoundary
        status={query.status}
        label={t('partner.loading')}
        endpoints={['GET /ib/status']}
        onRetry={() => query.refetch()}
        errorMessage={apiErrorMessage(query.error, t('partner.loadFailed'))}
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
        agencyName={application.agencyName ?? null}
      />
    );

  if (application?.status === 'rejected') {
    return (
      <RejectedPanel
        reason={application.rejectionReason}
        onReapply={onChanged}
        inherited={status.inheritedAgency ?? null}
      />
    );
  }

  if (!status.eligible)
    return <IneligiblePanel reason={status.ineligibleReason} code={status.ineligibleCode} />;

  /*
   * The inherited programme travels with the panel.
   *
   * A client introduced by an existing partner does not choose — they sell
   * beneath their introducer and carry that introducer's programme. The API
   * decides this (and ignores any agency such an applicant sends); the panel
   * only needs to know whether to draw a picker or a statement.
   */
  return <ApplyPanel onApplied={onChanged} inherited={status.inheritedAgency ?? null} />;
}

/**
 * The approved partner's screen: their commission CARD beside who they are.
 *
 * ## Why these two sit side by side
 *
 * The card is the only thing on this page a partner can ACT on, and the panel
 * beside it is the identity that explains the card — their level, their agency,
 * and the referral link that produces the balance in the first place. Stacked,
 * the card pushed the referral link below the fold on a laptop, which is the one
 * control a partner comes back to copy.
 *
 * The card takes ONE column of three. It is a fixed-ratio object (`aspect-[1.586]`,
 * the real ID-1 card ratio) so a wider column makes it taller, not more useful —
 * past about `max-w-md` it stops reading as a card and starts reading as a
 * poster. The panel takes the remaining two because its content is text that
 * genuinely benefits from width.
 *
 * `items-start`, so the shorter column does not stretch to match the taller one:
 * these are two different objects, not two halves of a row.
 *
 * ## Where `commissionWallets` comes from
 *
 * `GET /ib/overview`, read here under the SAME `ib-overview` query key that
 * `PartnerOverview` uses inside the tabs. React Query serves both from one
 * cached response, so this is not a second request and — more importantly — the
 * balance on the card and the lifetime-earnings total in the tab below can never
 * be figures from two different instants. That guarantee is why the balance
 * rides on the overview response rather than an endpoint of its own; moving the
 * card up the page did not give it up.
 *
 * The query is only mounted for an APPROVED partner, which is what this
 * component means — `GET /ib/overview` 404s for anyone else, and `useResource`
 * would report that as `unavailable` ("not built"), which is the wrong sentence.
 */
function ApprovedPanel({ account }: { account: NonNullable<IbStatus['account']> }) {
  const hydrated = useHydrated();
  const referralLink = hydrated
    ? `${window.location.origin}/auth/register?ref=${account.referralCode}`
    : '';

  const overview = useResource<IbOverview>(['ib-overview'], (signal) =>
    partnerApi.overview(signal),
  );
  const { user } = useUser();

  /*
   * The name embossed on the card foot.
   *
   * Undefined rather than a placeholder when the profile has no name: this app
   * once rendered the literal "Client User" for a null user on the
   * customer-facing portal, which is fabricated identity in the same family as a
   * fabricated balance. The card omits the line instead.
   */
  const holder = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined;

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/*
          The card, top left. It renders from whatever the overview read
          produced: an empty array is the "never credited" placeholder, and a
          FAILED read renders nothing at all rather than an empty card — an
          error is not the same as having no commission, and the tabs below
          surface the failure with a retry through their own AsyncBoundary.
        */}
        <CommissionWallet wallets={overview.data?.commissionWallets ?? []} holder={holder} />

        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Handshake className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold">{t('partner.approvedHeading')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('partner.approvedSince', { date: formatDate(account.approvedAt) })}
              </p>
            </div>
          </div>

          {!account.active && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground"
            >
              {t('partner.suspendedNotice')}
            </p>
          )}

          {account.agencyName && (
            <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('partner.agencyLabel')}
              </p>
              <p className="mt-1 text-sm font-semibold">{account.agencyName}</p>
              {account.products.length > 0 && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t('partner.agencyProducts', { products: account.products.join(', ') })}
                </p>
              )}
            </div>
          )}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                {t('partner.levelLabel')}
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{account.level}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted-foreground">
                {t('partner.referralCodeLabel')}
              </dt>
              <dd className="mt-1 font-mono text-2xl font-bold tracking-wider">
                {account.referralCode}
              </dd>
            </div>
          </dl>

          <div className="mt-6 space-y-1.5">
            <Label htmlFor="referral-link">{t('partner.referralLinkLabel')}</Label>
            <CopyableLink id="referral-link" value={referralLink} />
          </div>
        </div>
      </div>
      <PartnerDashboard />
    </div>
  );
}

function CopyableLink({ id, value }: { id: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={() => void copy()} disabled={!value}>
          {copied ? (
            <>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('partner.copied')}
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('partner.copy')}
            </>
          )}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-xs text-destructive">
          {t('partner.copyFailed')}
        </p>
      )}
    </div>
  );
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

function RejectedPanel({
  reason,
  onReapply,
  inherited,
}: {
  reason: string | null;
  onReapply: () => void;
  /** Carried through to the form — a re-application inherits exactly as a first one does. */
  inherited: IbStatus['inheritedAgency'];
}) {
  const [reapplying, setReapplying] = React.useState(false);

  if (reapplying) return <ApplyPanel onApplied={onReapply} inherited={inherited} />;

  return (
    <div className="space-y-4">
      <StatusPanel
        icon={XCircle}
        tone="destructive"
        heading={t('partner.rejectedHeading')}
        body={t('partner.rejectedReapply')}
      >
        {reason && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-left">
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

function IneligiblePanel({
  reason,
  code,
}: {
  reason: string | null;
  code: IbStatus['ineligibleCode'];
}) {
  // `chain_full` has nothing to verify and nowhere to be sent: the ladder has no
  // rung left beneath the partner who introduced them. Offering "Verify now"
  // there is an instruction the client cannot follow. The body stays the API's
  // own sentence in both cases — a second copy here would drift from it.
  const chainFull = code === 'chain_full';

  return (
    <StatusPanel
      icon={chainFull ? Network : ShieldCheck}
      tone="muted"
      heading={chainFull ? t('partner.ineligibleChainFullHeading') : t('partner.ineligibleHeading')}
      body={reason ?? ''}
    >
      {!chainFull && (
        <div className="mt-5 flex justify-center">
          <Button asChild>
            <Link href="/kyc">{t('partner.verifyNow')}</Link>
          </Button>
        </div>
      )}
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
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
