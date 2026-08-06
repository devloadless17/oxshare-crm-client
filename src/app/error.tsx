'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

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
 * `reset()` re-renders the segment, which recovers a transient data-load failure
 * without a full reload. The link is the escape hatch for when it does not.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
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
        <Button type="button" onClick={reset}>
          {t('session.retry')}
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">{t('error.backToDashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}
