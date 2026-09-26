'use client';

import Link from 'next/link';
import * as React from 'react';
import { BadgeCheck } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { AsyncBoundary } from '@/components/async-boundary';
import { KycSubmissionDetails } from '@/components/kyc/kyc-submission-details';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { addressLine, formatDateOfBirth, formatPhone } from '@/lib/profile';
import { AvatarUploader } from './avatar-uploader';
import { ChangePasswordForm } from './change-password-form';
import { SessionsList } from './sessions-list';
import { VerificationStatus } from './verification-status';

type KycStatusDto = components['schemas']['KycStatusDto'];

/**
 * The client's own account.
 *
 * `/profile` was a sidebar entry marked `comingSoon` for months with no
 * `page.tsx` behind it. It has a route now, and the account menu at the foot of
 * the sidebar links here — which is precisely why it had to exist before that
 * menu shipped. A navigation entry that 404s is a bug this repo has already
 * fixed once, on four links at the same time.
 *
 * ## The layout
 *
 * Full width, and a two-column grid above `xl`. The first version was
 * `max-w-3xl` centred, which on a wide monitor left most of the screen empty
 * while the session list — the widest thing on the page, and the one that
 * benefits most from room — wrapped its device names.
 *
 * The split is by RHYTHM, not by importance. Identity and verification are
 * read-once reference: short, static, scanned in a second. Password and
 * sessions are the work: forms, buttons, rows that change. Putting reference
 * material in a narrow rail and working material in the wide column means
 * neither is stretched into a shape it does not want — and collapsed to one
 * column below `xl`, the order still reads in the sequence somebody asks the
 * questions: who am I, am I verified, how do I secure this, where am I signed
 * in.
 *
 * ## Everything here is live
 *
 * Account details come from `GET /auth/me`, which `UserContext` has already
 * loaded. Verification comes from `GET /kyc/status` — the identity check its
 * title names, never the email flag (`verification-status.tsx` says why) — the
 * same cached read the documents section below uses.
 *
 * Password and Active sessions rendered `BackendPending` until the endpoints
 * behind them were built, because neither existed: the only password write was
 * `POST /auth/reset-password` (an e-mailed single-use token, for people who
 * CANNOT sign in), and nothing exposed the refresh-token families at all. Both
 * are real now — `POST /auth/change-password`, `GET /auth/sessions` and
 * `DELETE /auth/sessions/:id` — and the `refresh_tokens` table gained the
 * user-agent and address columns without which a session list could only have
 * said "a session exists, it expires in 29 days".
 */
export default function ProfilePage() {
  const { user, refetchUser } = useUser();
  const [sessionsEpoch, setSessionsEpoch] = React.useState(0);
  // The same key the KYC screens and the sidebar badge read, so this is
  // usually a cache hit rather than a request.
  const kycQuery = useResource(
    keys.kyc.status(),
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );

  // `RequireAuth` in PortalLayout does not render this until the profile has
  // loaded, so `user` is non-null here in practice. The guard is for the type
  // and for anyone who mounts this outside that layout.
  if (!user) return null;

  // The pill under the name says "Email verified", so it is driven by the
  // email flag — not by the KYC level, which told a KYC-approved client with an
  // unconfirmed address the opposite of what the panel below correctly said.
  const verified = user.emailVerified;
  const fullName = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <PageHeader
        name={fullName}
        email={user.email}
        avatarUrl={user.avatarUrl}
        firstName={user.firstName}
        lastName={user.lastName}
        verified={verified}
        memberSince={user.createdAt}
        // Refetching the PROFILE rather than swapping a local URL: the avatar
        // appears in the sidebar and the account menu too, and those read the
        // same context. One refetch updates every one of them.
        onAvatarChanged={() => void refetchUser()}
      />

      {/*
        `minmax(0,1fr)` on the ONE-column case too, not just at `xl`.

        A grid column defaults to `auto`, which is floored at its content's
        MIN-content width — so a single child that refuses to shrink widens the
        column and every card on the page bleeds past the page gutter. That is
        what happened at 393px: the email field's `truncate` span still reports
        its full unwrapped width as min-content (a flex item's `min-width` is
        `auto` until told otherwise), and all four panels sat 7px past the right
        margin, clipped rather than scrolling — so the defect was invisible to
        the `document.scrollWidth` sweep in `e2e/ux-sweep.spec.ts`.

        `min-w-0` on that span (see `Field`) fixes the cause; this caps the
        column so the NEXT stubborn child overflows itself instead of the page.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start">
        {/* Reference rail: short, static, read once. */}
        <div className="space-y-6">
          <Panel title={t('profile.detailsTitle')}>
            <dl className="space-y-4">
              {/* The number the client is known by on every screen of the
                  broker's console — the one to quote when they contact
                  support, which is why it leads the panel. */}
              <Field
                label={t('profile.portalId')}
                value={String(user.portalId)}
                hint={t('profile.portalIdHint')}
                hintTone="neutral"
              />
              <Field label={t('profile.firstName')} value={user.firstName} />
              <Field label={t('profile.lastName')} value={user.lastName} />
              <Field
                label={t('profile.email')}
                value={user.email}
                // Stated beside the address rather than as a separate badge
                // elsewhere in the chrome: it is a fact ABOUT this field, and
                // nowhere else needs to repeat it.
                hint={
                  user.emailVerified ? t('profile.emailVerified') : t('profile.emailUnverified')
                }
                hintTone={user.emailVerified ? 'success' : 'warning'}
              />
              {/*
                THE WHOLE PROFILE, once (backend 0139). The date of birth,
                nationality and address used to exist only inside the KYC
                submission, so this panel showed a name and a phone while the
                section below printed the name again beside the rest — one person
                described twice, by two records that could and did disagree.
                Every field is optional on UserProfileDto; an empty row reads as
                a failed load, so "Not provided" says which it is.
              */}
              <Field label={t('profile.dateOfBirth')} value={formatDateOfBirth(user.dateOfBirth)} />
              <Field label={t('profile.nationality')} value={user.nationality} />
              <Field label={t('profile.phone')} value={formatPhone(user.phone)} />
              <Field label={t('profile.country')} value={user.country} />
              <Field label={t('profile.address')} value={addressLine(user)} />
              <Field
                label={t('profile.accountType')}
                value={
                  // The DERIVED classification the API now answers everywhere:
                  // partner ▸ referral ▸ individual ("Normal"). There was never
                  // a `corporate` type; the old label set described a shape the
                  // enum did not have.
                  user.type === 'partner'
                    ? t('profile.typePartner')
                    : user.type === 'referral'
                      ? t('profile.typeReferral')
                      : t('profile.typeIndividual')
                }
              />
            </dl>
            <ProfileEditNote kycStatus={kycQuery.data?.status} />
          </Panel>

          <Panel title={t('profile.verificationTitle')}>
            <VerificationStatus kyc={kycQuery} verificationLevel={user.verificationLevel} />
          </Panel>
        </div>

        {/* Working column: forms and rows that change. */}
        <div className="space-y-6">
          <Panel title={t('profile.securityTitle')}>
            {/* A successful change revokes every other session, so the list
                below is stale the instant this succeeds. Bumping the key
                refetches it, which is what turns "3 sessions" into "1" in front
                of the client rather than on their next visit. */}
            <ChangePasswordForm onChanged={() => setSessionsEpoch((n) => n + 1)} />
          </Panel>

          <Panel title={t('profile.sessionsTitle')}>
            <SessionsList refreshToken={sessionsEpoch} />
          </Panel>
        </div>
      </div>

      {/*
        What the client sent for verification and where each document stands.
        Below the grid rather than in either column: the documents table wants
        the full width, and it is the same view as the KYC outcome screen, so a
        client never has to go back into onboarding to see their own passport.
        Nothing renders before they have started — an empty table there reads
        as documents having gone missing.
      */}
      <AsyncBoundary
        status={kycQuery.status}
        label={t('common.loading')}
        endpoints={['GET /kyc/status']}
        onRetry={() => kycQuery.refetch()}
        errorMessage={t('kyc.statusLoadFailed')}
        error={kycQuery.error}
      >
        {kycQuery.data && kycQuery.data.status !== 'not_started' && (
          <section className="space-y-3 pb-6">
            <h2 className="text-base font-semibold text-foreground">{t('profile.kycTitle')}</h2>
            {/* The documents, and only a broker's own questions: the identity
                itself is the panel above. */}
            <KycSubmissionDetails status={kycQuery.data} hideProfile />
          </section>
        )}
      </AsyncBoundary>
    </div>
  );
}

/**
 * The identity band.
 *
 * Deliberately not a card: it is the page's title, and boxing a title inside
 * the content area makes the first thing on screen look like the first item in
 * a list.
 */
function PageHeader({
  name,
  email,
  avatarUrl,
  firstName,
  lastName,
  verified,
  memberSince,
  onAvatarChanged,
}: {
  name: string;
  email: string;
  avatarUrl: string | null | undefined;
  firstName: string;
  lastName: string;
  verified: boolean;
  memberSince: string;
  onAvatarChanged: () => void;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-center lg:gap-6">
      <AvatarUploader
        avatarUrl={avatarUrl}
        firstName={firstName}
        lastName={lastName}
        onChanged={onAvatarChanged}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{name}</h1>
          {verified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t('profile.emailVerified')}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{email}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('profile.memberSince')}{' '}
        <span className="font-medium text-foreground">
          {/*
            `toLocaleDateString` with no locale follows the browser, which is
            what a client expects of their own join date. Money is the thing
            that must never be formatted this way — see lib/money.ts, where
            Intl is banned because it rounds.
          */}
          {new Date(memberSince).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </p>
    </header>
  );
}

/** One titled section. The only card shape on this page, used four times. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3.5 text-sm font-semibold text-foreground sm:px-6 sm:py-4">
        {title}
      </h2>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  hint,
  hintTone,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  /** `neutral` for a note that is not a status — the Portal ID's "quote it". */
  hintTone?: 'success' | 'warning' | 'neutral';
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
        {/*
          `min-w-0` is what makes `truncate` actually truncate here. A flex
          item's `min-width` is `auto`, which floors it at min-content — and
          `truncate`'s `white-space: nowrap` makes min-content the WHOLE
          unwrapped string. So a long email did not ellipsis; it pushed the
          card, its panel and the page grid wider than the screen.
        */}
        <span className="min-w-0 truncate">{value?.trim() || t('profile.notProvided')}</span>
        {hint && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              hintTone === 'success'
                ? 'bg-success/15 text-success'
                : hintTone === 'neutral'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-warning/15 text-warning'
            }`}
          >
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * Where the client changes these details — which depends on where their
 * verification stands, and says so rather than leaving them to find out.
 *
 * The profile is EDITED in the identity verification's personal step while the
 * client still holds it; once submitted, what they wrote is what a reviewer is
 * checking against their documents, and after approval it is verified
 * (backend `deskLocks`). A page that showed the details with no word on how to
 * change them sends a client who moved house to guess.
 */
function ProfileEditNote({ kycStatus }: { kycStatus?: string }) {
  if (kycStatus === 'submitted' || kycStatus === 'under_review') {
    return (
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t('profile.editLockedReview')}
      </p>
    );
  }
  if (kycStatus === 'approved') {
    return (
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t('profile.editLockedVerified')}
      </p>
    );
  }
  return (
    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
      {t('profile.editInKyc')}{' '}
      <Link
        href="/kyc"
        className="rounded-md font-semibold text-link hover:underline focus-outline"
      >
        {t('profile.editCta')}
      </Link>
    </p>
  );
}
