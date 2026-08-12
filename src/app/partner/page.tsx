'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Handshake, ShieldCheck, Clock, XCircle } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { ApplyPanel } from '@/components/partner/apply-panel';
import { PartnerDashboard } from '@/components/partner/partner-dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHydrated } from '@/hooks/use-hydrated';
import { useResource } from '@/hooks/use-resource';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi, type IbStatus } from '@/lib/api/partner';
import { t } from '@/lib/i18n';

/**
 * Become a partner, or see where you stand.
 *
 * ## One route, five states, and none of them guessed
 *
 * Approved · pending · rejected · eligible-to-apply · not-yet-eligible. They
 * are decided from `GET /ib/status`, which returns the account AND the latest
 * application precisely so this screen can tell them apart.
 *
 * `kyc/submitted/page.tsx` records the bug this is built to avoid: it once
 * seeded optimistic state and swallowed the error, so a failed request told the
 * client their submission was under review when nothing had been sent. There is
 * no default state here. A failed request renders the error with a retry, and
 * "we don't know" never renders as "pending" — on a screen about money somebody
 * expects to earn, those are not the same sentence.
 *
 * ## The refusal is shown, not just the refusal's existence
 *
 * A rejected applicant sees the composed reason the reviewer gave, verbatim,
 * and a button to apply again. Dropping them back on a blank form would tell
 * them nothing about what to change, which is the whole reason the reason is
 * required on the admin side.
 *
 * ## Full width, on every state
 *
 * No `max-w-*` and no `mx-auto` anywhere on this route. The page fills whatever
 * the layout gives it.
 *
 * It briefly capped the four non-approved states at `max-w-3xl` and centred
 * them, on the reasoning that a lone "apply" card stretched across an ultrawide
 * monitor is a line of text with a button off to the right. That reasoning was
 * about the CARD, and the fix belongs on the card — the panels below cap their
 * own text with `max-w-md` on the copy that needs it. Capping the PAGE also
 * moved the heading and the whole column inward, so the partner screen sat at a
 * different width from every other screen in the portal and read as a different
 * app.
 */
export default function PartnerPage() {
  const query = useResource<IbStatus>(['ib-status'], (signal) => partnerApi.status(signal));

  /*
   * NO PAGE HEADER, and the panel takes the whole frame.
   *
   * Every state below opens with its own heading — "Become a partner", "Under
   * review", the partner's own dashboard — so a standing "Partner Programme"
   * above them was a second title saying the same thing in smaller words, with
   * the real one an inch below it.
   *
   * `flex min-h-0 flex-1 flex-col` continues the height chain `<main>` starts,
   * so the panel fills what is left rather than sitting in a short box with
   * empty space under it. `AsyncBoundary fill` carries it past the four states,
   * and the panels themselves stretch.
   */
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
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
  // The account wins over the application. An approved partner has an approved
  // application behind them, and showing the decision rather than the request
  // is what they came for.
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
    return <RejectedPanel reason={application.rejectionReason} onReapply={onChanged} />;
  }

  if (!status.eligible) return <IneligiblePanel reason={status.ineligibleReason} />;

  return <ApplyPanel onApplied={onChanged} />;
}

// ── approved ────────────────────────────────────────────────────────────────

function ApprovedPanel({ account }: { account: NonNullable<IbStatus['account']> }) {
  /*
   * Built in the browser, from the browser's own origin.
   *
   * A referral link is `${where the portal is}/auth/register?ref=CODE`, and the
   * API has no business knowing where the portal is deployed.
   *
   * `useHydrated` rather than `useState` + an effect: reading `location` during
   * render is a hydration mismatch, and the setState-in-an-effect version of
   * this is indistinguishable from a cascading-render bug — which is why the
   * lint rule rejects it. This says what it actually is: a value that differs
   * between server and client.
   */
  const hydrated = useHydrated();
  const referralLink = hydrated
    ? `${window.location.origin}/auth/register?ref=${account.referralCode}`
    : '';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
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

        {/* A suspended partner keeps their link and stops earning. Saying only
            one of those halves would be misleading either way. */}
        {!account.active && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning-foreground"
          >
            {t('partner.suspendedNotice')}
          </p>
        )}

        {/*
          THE AGENCY, and what it lets them sell.

          A partner's clients are offered this agency's products and nothing
          else, so it is the single fact that decides what their book can hold —
          and until now the only place it existed was an admin screen they
          cannot see.

          Absent when they are on no agency, rather than printed as "none": a
          partner appointed before agencies existed has clients who are offered
          the FULL catalogue, and "none" would read as the opposite.
        */}
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

      {/*
        The dashboard: earnings, referred clients and sub-partners.

        It replaces a single line that read "earnings reporting is not available
        yet". That sentence was true and is now MORE precisely true one level
        down — `PartnerDashboard` renders the real ledger totals and states that
        the commission engine has not run, rather than asking the partner to
        infer it. The rule is unchanged: never a computed-looking zero.

        Its own `AsyncBoundary` and its own query, deliberately. This panel has
        already rendered by the time the overview resolves, so a partner sees
        their referral link immediately instead of waiting on a second request
        to paint the screen they came for.
      */}
      <PartnerDashboard />
    </div>
  );
}

/** The link, plus a copy button that reports whether it worked. */
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
      /*
       * `navigator.clipboard` is unavailable over plain HTTP and can be denied
       * by permission. Saying so — and telling them to select it manually —
       * beats a button that appears to do nothing, which is what a swallowed
       * failure looks like from the outside.
       */
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

// ── pending ─────────────────────────────────────────────────────────────────

function PendingPanel({
  submittedAt,
  agencyName,
}: {
  submittedAt: string;
  agencyName: string | null;
}) {
  /*
   * The programme they asked for, in the footnote beside the date.
   *
   * Once the form is gone this is the only place an applicant can see what they
   * requested, and "which one did I pick" is the question somebody asks a week
   * into waiting. Null on an application submitted before agencies existed, and
   * then the footnote is the date alone rather than an empty label.
   */
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

// ── rejected ────────────────────────────────────────────────────────────────

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
        {/* The composed sentence the reviewer chose, verbatim. It is the only
            thing on this screen that tells them what to change. */}
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

// ── not eligible ────────────────────────────────────────────────────────────

function IneligiblePanel({ reason }: { reason: string | null }) {
  return (
    <StatusPanel
      icon={ShieldCheck}
      tone="muted"
      heading={t('partner.ineligibleHeading')}
      // The API's own sentence. It knows which requirement is unmet; this
      // screen restating it in different words would be a second copy to drift.
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

// ── shared shell ────────────────────────────────────────────────────────────

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
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
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

/**
 * A date, in the reader's own locale.
 *
 * Guarded because the value arrives as a string from the API: an unparseable
 * one would otherwise render as "Invalid Date" on a screen a client is reading
 * for reassurance.
 */
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
