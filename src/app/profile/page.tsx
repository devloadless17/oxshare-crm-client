'use client';

import Link from 'next/link';
import * as React from 'react';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from '@/components/ui/avatar';
import { useUser } from '@/context/UserContext';
import { t } from '@/lib/i18n';
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
  const { user } = useUser();
  const [sessionsEpoch, setSessionsEpoch] = React.useState(0);

  // `RequireAuth` in PortalLayout does not render this until the profile has
  // loaded, so `user` is non-null here in practice. The guard is for the type
  // and for anyone who mounts this outside that layout.
  if (!user) return null;

  const verified = user.verificationLevel === 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage alt="" />
          <AvatarFallback className="text-lg">
            {initialsOf(user.firstName, user.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
            {`${user.firstName} ${user.lastName}`.trim()}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">{t('profile.detailsTitle')}</h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label={t('profile.firstName')} value={user.firstName} />
          <Field label={t('profile.lastName')} value={user.lastName} />
          <Field
            label={t('profile.email')}
            value={user.email}
            // The verified state is stated beside the address rather than as a
            // separate badge somewhere else in the chrome — it is a fact ABOUT
            // this field, and nowhere else needs to repeat it.
            hint={user.emailVerified ? t('profile.emailVerified') : t('profile.emailUnverified')}
            hintTone={user.emailVerified ? 'success' : 'warning'}
          />
          <Field
            label={t('profile.phone')}
            value={user.phone}
            // `phone` and `country` are optional on UserProfileDto. Rendering an
            // empty definition list row reads as a failed load; saying "Not
            // provided" says which of the two it is.
          />
          <Field label={t('profile.country')} value={user.country} />
          <Field
            label={t('profile.accountType')}
            value={
              user.type === 'corporate' ? t('profile.typeCorporate') : t('profile.typeIndividual')
            }
          />
          <Field
            label={t('profile.memberSince')}
            // `toLocaleDateString` with no locale argument follows the browser,
            // which is what a client expects of their own join date. Money is
            // the thing that must never be formatted this way — see lib/money.
            value={new Date(user.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {t('profile.verificationTitle')}
        </h2>
        <div className="flex items-center gap-3">
          {verified ? (
            <BadgeCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          )}
          <p className="text-xs text-muted-foreground">
            {verified ? t('profile.verificationApproved') : t('profile.verificationPending')}
          </p>
          {/* The one remaining route into KYC for a client who still has work.
              The sidebar entry disappears once they are approved, so an
              unverified client needs a way back in from somewhere permanent. */}
          {!verified && (
            <Link
              href="/kyc"
              className="ml-auto shrink-0 rounded-md text-xs font-semibold text-link hover:underline focus-outline"
            >
              {t('profile.verificationCta')}
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">{t('profile.securityTitle')}</h2>
        {/* A successful change revokes every other session, so the list below
            is stale the instant this succeeds. Bumping the key refetches it,
            which is what turns "3 sessions" into "1" in front of the client
            rather than on their next visit. */}
        <ChangePasswordForm onChanged={() => setSessionsEpoch((n) => n + 1)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('profile.sessionsTitle')}</h2>
        <SessionsList refreshToken={sessionsEpoch} />
      </section>
    </div>
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
