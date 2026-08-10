'use client';

import * as React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { accountApi, type Session } from '@/lib/api/account';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { relativeTime } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';

/**
 * Where this account is signed in, and a way to end any of it.
 *
 * One row per LOGIN, not per token: the API groups refresh-token families, so a
 * client signed in for a month on one laptop is thousands of rotations and
 * exactly one row here.
 *
 * The row exists to answer one question — "is one of these not me" — which is
 * why the device and the last-active time are the prominent parts and the
 * expiry is not shown at all. "Expires in 29 days" is true of every row and
 * distinguishes nothing.
 */
export function SessionsList({ refreshToken }: { refreshToken?: number }) {
  const sessions = useResource(['auth', 'sessions', refreshToken], (signal) =>
    accountApi.listSessions(signal),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('profile.sessionsSubtitle')}</p>

      <AsyncBoundary
        status={sessions.status}
        label={t('profile.sessionsLoading')}
        endpoints={['GET /auth/sessions']}
        onRetry={() => void sessions.refetch()}
        errorMessage={apiErrorMessage(sessions.error, t('profile.sessionsLoadFailed'))}
        error={sessions.error}
      >
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {(sessions.data ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoked={() => void sessions.refetch()}
            />
          ))}
        </ul>
      </AsyncBoundary>
    </div>
  );
}

function SessionRow({ session, onRevoked }: { session: Session; onRevoked: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await accountApi.revokeSession(session.id);
      onRevoked();
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('profile.sessionRevokeFailed')));
      // Deliberately NOT cleared in a `finally` alongside `busy` — the row must
      // keep saying the sign-out failed until something changes. A message that
      // vanishes on its own is how a client concludes it worked.
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const Icon = looksMobile(session.userAgent) ? Smartphone : Monitor;

  return (
    <li className="flex items-center gap-3 p-4">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {describeDevice(session.userAgent)}
          </span>
          {session.current && (
            <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              {t('profile.sessionCurrent')}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {t('profile.sessionLastActive', { when: relativeTime(session.lastActiveAt) })}
          {session.ip ? ` · ${session.ip}` : ''}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t('profile.sessionSignedIn', { when: absoluteDate(session.createdAt) })}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[11px] text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* The current session has no button. The API refuses to revoke it — it
          would kill the family while leaving the cookies in the browser — and
          offering a control that is always rejected is worse than not offering
          it. Log out, in the account menu, is the operation that does both. */}
      {!session.current && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleRevoke()}
          loading={busy}
          className="shrink-0 text-destructive hover:bg-destructive/10"
        >
          <span>{busy ? t('profile.sessionRevoking') : t('profile.sessionRevoke')}</span>
        </Button>
      )}
    </li>
  );
}

/**
 * A readable device name from a User-Agent.
 *
 * Deliberately crude, and deliberately not a UA-parsing dependency. The string
 * only has to be recognisable enough for a client to think "that is not my
 * phone" — precision beyond that buys nothing, and every UA database is a
 * maintenance commitment that goes stale.
 *
 * Exported for tests: the interesting case is the NULL one, which every session
 * predating the metadata columns has.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return t('profile.sessionNoDetails');

  const browser =
    // Order matters: Edge and Opera both claim Chrome, and Chrome claims Safari.
    /\bEdg\//.test(userAgent)
      ? 'Edge'
      : /\bOPR\/|\bOpera\b/.test(userAgent)
        ? 'Opera'
        : /\bFirefox\//.test(userAgent)
          ? 'Firefox'
          : /\bChrome\//.test(userAgent)
            ? 'Chrome'
            : /\bSafari\//.test(userAgent)
              ? 'Safari'
              : null;

  const os = /\bWindows\b/.test(userAgent)
    ? 'Windows'
    : /\bAndroid\b/.test(userAgent)
      ? 'Android'
      : /\biPhone\b|\biPad\b|\biOS\b/.test(userAgent)
        ? 'iOS'
        : /\bMac OS X\b|\bMacintosh\b/.test(userAgent)
          ? 'macOS'
          : /\bLinux\b/.test(userAgent)
            ? 'Linux'
            : null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? t('profile.sessionUnknownDevice');
}

/** Phone or laptop, for the icon only. Wrong guesses cost nothing. */
function looksMobile(userAgent: string | null | undefined): boolean {
  return !!userAgent && /\bAndroid\b|\biPhone\b|\biPad\b|\bMobile\b/.test(userAgent);
}

/** The login date, absolute — "signed in 3 weeks ago" is harder to place. */
function absoluteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
