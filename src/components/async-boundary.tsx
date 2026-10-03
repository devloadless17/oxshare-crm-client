'use client';

import { BackendPending } from '@/components/backend-pending';
import { PageLoader } from '@/components/ui/loader';
import type { ResourceStatus } from '@/hooks/use-resource';
import { t } from '@/lib/i18n';
import { ltr } from '@/lib/bidi';
import { apiErrorDetail, apiErrorMessage, apiErrorRequestId } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';

/**
 * The loading / not-built-yet / error / ready branch, in one place.
 *
 * NEAR-TWIN of the same path in oxshare-crm-admin: same props, same four
 * branches. Keep the props and the branch behaviour in step by hand.
 *
 * The exclusion from scripts/check-twins.sh is now HISTORICAL rather than
 * structural: it was excluded because the loading state used a different
 * component in each app — admin its own components/ui/loader, this app lucide's
 * `Loader2` — and both have rendered `PageLoader` from the twin
 * `components/ui/loader` since that file landed. This comment claimed otherwise
 * long after it stopped being true, which is the stale-literal class that has
 * disarmed a check in this system three times.
 */
export function AsyncBoundary({
  status,
  label,
  endpoints,
  onRetry,
  errorMessage,
  error,
  fill = false,
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
  /**
   * Let the ready branch own the remaining height, and centre the others in it.
   *
   * For pages whose child is a `fill` DataTable. Without this the four non-ready
   * branches are content-height cards that sit at the top of a tall empty page,
   * and the ready branch — a fragment — leaves the table's `flex-1` to resolve
   * against the page wrapper, which works only by accident of there being no
   * other flex child. Passing it makes the height contract explicit at every
   * branch rather than at one.
   *
   * Ported from admin's copy verbatim. These two files are NEAR-TWINS whose doc
   * asks for the props to be kept in step by hand, and this one is what that
   * instruction is for: admin grew `fill` when `DataTable` did, this app did
   * not, and the divergence only surfaced when the table was ported here too.
   */
  fill?: boolean;
  children: React.ReactNode;
}) {
  /*
   * The non-ready branches keep their natural size and are CENTRED in the
   * space, rather than stretched to fill it. A retry card stretched to 700px
   * tall puts its button in the middle of an empty expanse; centring a
   * normally-sized card is what every other full-height empty state does.
   */
  const frame = fill ? 'flex min-h-0 flex-1 flex-col items-center justify-center' : '';

  // `srOnly`, because this sits inside a page that already has a heading saying
  // what is loading. Repeating it under the spinner is noise for a sighted
  // reader; a screen reader still hears it through `PageLoader`'s role="status".
  if (status === 'loading') {
    return fill ? (
      <div className={frame}>
        <PageLoader label={label} srOnly />
      </div>
    ) : (
      <PageLoader label={label} srOnly />
    );
  }

  if (status === 'unavailable') {
    return fill ? (
      <div className={frame}>
        <BackendPending endpoints={endpoints} />
      </div>
    ) : (
      <BackendPending endpoints={endpoints} />
    );
  }

  /*
   * A route's own 404: the RECORD is missing — or, in the console, outside the
   * reader's territory, which the API answers identically on purpose. Never
   * "not built yet" (that is `unavailable`, the API's ROUTE_NOT_FOUND), and no
   * retry: asking again cannot make it exist. The server's sentence when it
   * wrote one ("Deposit not found.").
   */
  if (status === 'notFound') {
    const card = (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-2"
        role="alert"
      >
        <p className="text-sm font-semibold text-foreground">{t('common.notFoundTitle')}</p>
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(error, '') || t('common.notFoundBody')}
        </p>
      </div>
    );
    return fill ? <div className={frame}>{card}</div> : card;
  }

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
    const card = (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-2"
        role="alert"
      >
        <p className="text-sm font-semibold text-foreground">{t('common.notPermittedTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('common.notPermittedBody')}</p>
      </div>
    );
    return fill ? <div className={frame}>{card}</div> : card;
  }

  /*
   * A 401 that reached the screen.
   *
   * In this app that is NOT always the interceptor mid-redirect: when the
   * refresh could not be asked at all (`unreachable`), the interceptor lets the
   * 401 propagate without ending the session — deliberately, so a network blip
   * mid-KYC does not sign anybody out. So this branch can be a settled state,
   * and a spinner here could hang for ever. It renders the retry card with a
   * sentence that says what actually happened, rather than "something went
   * wrong".
   *
   * DIVERGES FROM THE ADMIN'S COPY deliberately: the admin interceptor always
   * navigates on a terminal 401, so that app paints a loader here.
   */
  if (status === 'unauthenticated') {
    const card = (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-3"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">{t('session.unconfirmed')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('common.retryShort')}
        </Button>
      </div>
    );
    return fill ? <div className={frame}>{card}</div> : card;
  }

  if (status === 'error') {
    const requestId = apiErrorRequestId(error);
    /*
     * BOTH SENTENCES — and this branch was dropping the OPPOSITE half from the
     * one its admin twin dropped, which is the more interesting half of the
     * story.
     *
     * Admin rendered `apiErrorMessage(error, errorMessage ?? generic)`, and that
     * helper prefers `response.data.message`, which `AllExceptionsFilter` puts
     * on every envelope — so the caller's line was unreachable for any error
     * with a body. This file rendered `errorMessage ?? genericError` and never
     * looked at the API's message AT ALL, so a client saw "Something went wrong"
     * for a 400 that had said exactly what was wrong.
     *
     * Two near-twins, one branch, opposite losses, and `check:twins` could not
     * see it: `async-boundary.tsx` is EXCLUDED from that check because the two
     * apps use different loader components. An exclusion granted for a rendering
     * difference had quietly come to cover a behavioural one.
     *
     * The two messages answer different questions and neither replaces the
     * other. The caller's line says WHAT FAILED AND WHAT IT MEANS HERE; the
     * API's says WHY. So the caller's line leads, the API's follows as detail,
     * and the detail is dropped when it would only repeat the line above it.
     */
    const detail = apiErrorMessage(error, '');
    const headline = errorMessage ?? (detail || t('common.genericError'));
    const showDetail = detail !== '' && detail !== headline;
    const technical = apiErrorDetail(error);
    const card = (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center space-y-3"
        role="alert"
      >
        <p className="text-sm text-muted-foreground">{headline}</p>
        {showDetail && <p className="text-xs text-muted-foreground/80">{detail}</p>}
        {/* The envelope's technical `detail`, when sent: small, LTR, copyable. */}
        {technical && (
          <p
            dir="ltr"
            className="text-[11px] font-mono break-words text-muted-foreground/70 select-all"
          >
            {technical}
          </p>
        )}
        {/*
          The id the API already logged with this failure. Rendered small and
          selectable rather than hidden behind a "details" toggle: its whole
          purpose is to be copied into a support message, and a user who has to
          find it first mostly will not.
        */}
        {requestId && (
          <p className="text-[11px] font-mono text-muted-foreground/70 select-all">
            {t('common.errorReference', { id: ltr(requestId) })}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('common.retryShort')}
        </Button>
      </div>
    );
    return fill ? <div className={frame}>{card}</div> : card;
  }

  /*
   * The ready branch STRETCHES; it does not centre. `frame` centres its child,
   * which is right for a card and wrong for a table that is supposed to fill
   * the space — so this uses the stretching half of the same contract.
   */
  return fill ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : <>{children}</>;
}
