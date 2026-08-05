'use client';

import { Loader2 } from 'lucide-react';
import { BackendPending } from '@/components/backend-pending';
import type { ResourceStatus } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';
import { apiErrorRequestId } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';

/**
 * The loading / not-built-yet / error / ready branch, in one place.
 *
 * NEAR-TWIN of the same path in oxshare-crm-admin: same props, same four
 * branches. Excluded from scripts/check-twins.sh because the loading state uses a
 * different component in each app — admin renders its own components/ui/loader,
 * this app uses lucide's Loader2. Keep the props and the branch behaviour in step
 * by hand.
 */
export function AsyncBoundary({
  status,
  label,
  endpoints,
  onRetry,
  errorMessage,
  error,
  children,
}: {
  status: ResourceStatus;
  /** Screen-reader text for the spinner, e.g. "Loading wallets". */
  label: string;
  /** Endpoints named in the not-implemented-yet state. */
  endpoints: string[];
  /**
   * `unknown`, not `void`: callers pass React Query's `refetch`, which returns a
   * promise this component deliberately does not await. Typing it `() => void`
   * makes every `onRetry={refetch}` a no-misused-promises error and invites a
   * `void` at each call site to silence it. Ignoring the result is the real
   * contract, so the type says so once, here.
   */
  onRetry: () => unknown;
  errorMessage?: string;
  /**
   * The raw error, only so the request id can be shown under the message.
   *
   * Passed as the error rather than as an extracted id because every call site
   * already holds it — asking each one to call `apiErrorRequestId` first would
   * be a second thing to remember, and the one that forgot would be silently
   * back to an unreportable failure.
   */
  error?: unknown;
  children: React.ReactNode;
}) {
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-link" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (status === 'unavailable') return <BackendPending endpoints={endpoints} />;

  /*
   * A 403 is a closed door, not a broken page — R-2.3.
   *
   * It used to fall into the branch below, which offers "something went wrong"
   * and a Retry button. Retrying a permission failure cannot succeed, so the
   * client clicks it, watches it fail again, and reports a bug against a system
   * behaving exactly as configured. No retry here, and no request id: there is
   * nothing for support to look up.
   */
  if (status === 'forbidden') {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-2"
        role="alert"
      >
        <p className="text-sm font-semibold text-foreground">{t('common.notPermittedTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('common.notPermittedBody')}</p>
      </div>
    );
  }

  if (status === 'error') {
    const requestId = apiErrorRequestId(error);
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-3"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">{errorMessage ?? t('common.genericError')}</p>
        {/*
          The id the API already logged with this failure. Rendered small and
          selectable rather than hidden behind a "details" toggle: its whole
          purpose is to be copied into a support message, and a user who has to
          find it first mostly will not.
        */}
        {requestId && (
          <p className="text-[11px] font-mono text-muted-foreground/70 select-all">
            {t('common.errorReference', { id: requestId })}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('common.retryShort')}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
