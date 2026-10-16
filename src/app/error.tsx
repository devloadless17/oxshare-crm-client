'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { isStaleBuildError, reloadOnceForStaleBuild } from '@/lib/stale-build';
import { reportCrash } from '@/lib/crash-report';

/**
 * What a render-time throw looks like, instead of nothing.
 *
 * There was no `error.tsx` anywhere in this app, so any throw inside a client
 * page escaped to Next's default error page: unstyled, outside the portal shell,
 * with no navigation and no route back to sign-in. For a customer-facing portal
 * that is the worst screen in the product — it looks like the broker's site is
 * broken, and it appears at exactly the moment somebody is trying to move money
 * or finish identity verification.
 *
 * It is reachable on the auth path in particular: a throw while the session is
 * being confirmed lands here, and `RequireAuth` is mounted around every private
 * page.
 *
 * Try again RELOADS the page; it never calls `reset()`. A re-render brings back
 * whatever broke it: a tab from before a release, a page the browser translated,
 * a state the client cannot see. Clients on phones did not know to pull down to
 * refresh, pressed Try again and stayed stuck (16 Oct 2026). A reload loses
 * nothing the crash had not already lost, and it is what support would ask for.
 * The link is the way out for a page that fails every time.
 */
export default function PortalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /*
   * A tab from before a release (16 Oct 2026, a client's phone): the chunk it
   * asked for is gone. Reload once by ourselves; if that already happened, the
   * client's own Try again reloads.
   */
  const stale = isStaleBuildError(error);
  useEffect(() => {
    // Before the reload below, so a stale tab is counted too (keepalive).
    reportCrash(error, 'page');
    if (stale) reloadOnceForStaleBuild();
  }, [error, stale]);

  return (
    <div
      role="alert"
      className="flex h-dvh flex-col items-center justify-center gap-4 overflow-y-auto bg-background px-6 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <h1 className="text-lg font-bold text-foreground">{t('error.title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('error.body')}</p>
      {/*
       * The digest, not the message. Next replaces the message with a generic
       * string in production anyway, and the digest is the value that ties this
       * screen to a server log line — the one thing worth quoting to support.
       */}
      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground">{error.digest}</p>
      )}
      {/*
        Both through `<Button>`, so the recovery controls on the worst screen in
        the product look like every other control in it. They were two
        hand-written class strings that happened to match each other and nothing
        else — and this is the one screen where a client is already wondering
        whether the site is broken.
      */}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => window.location.reload()}>
          {t('session.retry')}
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{t('error.backToDashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}
