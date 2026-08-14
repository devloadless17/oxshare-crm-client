'use client';

import Link from 'next/link';
import * as React from 'react';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { t } from '@/lib/i18n';
import { AvatarUploader } from './avatar-uploader';
import { ChangePasswordForm } from './change-password-form';
import { SessionsList } from './sessions-list';

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
 * Account details and Verification come from `GET /auth/me`, which
 * `UserContext` has already loaded, so those sections add no request.
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

  // `RequireAuth` in PortalLayout does not render this until the profile has
  // loaded, so `user` is non-null here in practice. The guard is for the type
  // and for anyone who mounts this outside that layout.
  if (!user) return null;

  const verified = user.verificationLevel === 1;
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start">
        {/* Reference rail: short, static, read once. */}
        <div className="space-y-6">
          <Panel title={t('profile.detailsTitle')}>
            <dl className="space-y-4">
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
              {/* `phone` and `country` are optional on UserProfileDto. An empty
                  row reads as a failed load; "Not provided" says which it is. */}
              <Field label={t('profile.phone')} value={user.phone} />
              <Field label={t('profile.country')} value={user.country} />
              <Field
                label={t('profile.accountType')}
                value={
                  user.type === 'corporate'
                    ? t('profile.typeCorporate')
                    : t('profile.typeIndividual')
                }
              />
            </dl>
          </Panel>

          <Panel title={t('profile.verificationTitle')}>
            <div className="flex items-start gap-3">
              {verified ? (
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {verified ? t('profile.verificationApproved') : t('profile.verificationPending')}
                </p>
                {/* The one permanent route into KYC. The sidebar entry
                    disappears once approved, so an unverified client needs a
                    way back in from somewhere that does not move. */}
                {!verified && (
                  <Link
                    href="/kyc"
                    className="mt-2 inline-block rounded-md text-xs font-semibold text-link hover:underline focus-outline"
                  >
                    {t('profile.verificationCta')}
                  </Link>
                )}
              </div>
            </div>
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
  hintTone?: 'success' | 'warning';
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
        <span className="truncate">{value?.trim() || t('profile.notProvided')}</span>
        {hint && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              hintTone === 'success' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
            }`}
          >
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}
