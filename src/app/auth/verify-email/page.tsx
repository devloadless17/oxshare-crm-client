'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { PageLoader, Spinner } from '@/components/ui/loader';
import { api } from '@/lib/api';
import { useUser } from '@/context/UserContext';
import { apiErrorCode, apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { AuthShell } from '@/components/auth/auth-shell';
import { useHydrated } from '@/hooks/use-hydrated';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * What this screen has concluded. Exhaustive, and each case renders differently.
 *
 * `already` is the one the old three-boolean version could not express, and the
 * reason for this whole change (UX-BACKLOG UX-01): a link that has already been
 * redeemed is neither a success to celebrate nor a failure to apologise for.
 * Rendering it as the latter told verified clients that verification had failed.
 */
type Outcome =
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'already' }
  | { kind: 'expired' }
  /*
   * The route is rate-limited (10 per 15 minutes — auth.controller.ts). Without
   * this case a 429 fell through to `invalid` and read "Verification Failed",
   * which is the same lie UX-01 is about: the link is fine, the account may
   * well be verified, and the only thing that happened is that we asked the
   * client to wait. Reachable in practice when a scanner, a refresh and a human
   * all pull on the same link.
   */
  | { kind: 'throttled' }
  | { kind: 'invalid'; message: string };

/**
 * Where this tab remembers that it already verified.
 *
 * `sessionStorage`, not `localStorage`: the memory should die with the tab. It
 * is a UI convenience, not a fact about the account — the account's own state
 * lives in the database, and a stale "you verified" surviving in a browser for
 * weeks would be a small lie waiting to be told.
 */
const OUTCOME_KEY = 'oxshare.verify-email.outcome';

/**
 * Remember how this resolved, so a REFRESH does not have to ask again.
 *
 * The token is stripped from the URL once it has been redeemed, which means a
 * refresh arrives with nothing to verify. Without this, that lands on "token is
 * missing" — trading one wrong red screen for another.
 *
 * Belt and braces with the API's own idempotency: the backend would answer
 * `already_verified` if the token were re-sent. This exists so the common case
 * never needs a round trip, and so the screen is still right if the network is
 * gone by the time somebody hits reload.
 *
 * Wrapped because `sessionStorage` THROWS rather than returning null in Safari
 * private mode and under some enterprise policies. A storage failure must not
 * take down a screen that works perfectly well without it.
 */
function rememberOutcome(outcome: Outcome): void {
  try {
    sessionStorage.setItem(OUTCOME_KEY, outcome.kind);
  } catch {
    // Storage unavailable. The API is idempotent, so a refresh still resolves
    // correctly — just with a round trip.
  }
}

/**
 * Which refusal this is. Decided from the machine-readable code and the status,
 * never from the message — the message is prose and is translated.
 */
function refusalOutcome(err: unknown): Outcome {
  const code = apiErrorCode(err);
  if (code === 'VERIFICATION_TOKEN_EXPIRED') return { kind: 'expired' };
  if (code === 'RATE_LIMITED') return { kind: 'throttled' };
  return { kind: 'invalid', message: apiErrorMessage(err, t('auth.verify.invalidToken')) };
}

/** What this tab concluded earlier, if anything. */
function recallOutcome(): Outcome | null {
  try {
    const stored = sessionStorage.getItem(OUTCOME_KEY);
    if (stored === 'verified') return { kind: 'verified' };
    if (stored === 'already') return { kind: 'already' };
    return null;
  } catch {
    return null;
  }
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  /*
   * ONE outcome, not three booleans — UX-BACKLOG UX-01.
   *
   * `isLoading` + `isSuccess` + `errorMessage` could express states that do not
   * exist ("loading and failed") and could not express the one that matters:
   * ALREADY VERIFIED, which is neither a success to celebrate nor a failure to
   * apologise for. Every combination below is reachable and distinct.
   */
  const [redeemed, setOutcome] = React.useState<Outcome>({ kind: 'verifying' });

  /*
   * The THIRD way this screen can know the address is confirmed, after the tab's
   * own memory and the API's `already_verified`.
   *
   * `sessionStorage` dies with the tab, so the memory covers a refresh and a
   * Back within one sitting and nothing else. Close the browser, reopen it, and
   * press Back — or restore a tab, or run Safari in private mode where
   * `sessionStorage` THROWS — and a verified, signed-in client arrived at a
   * tokenless URL and was told "Verification Failed". Which is UX-01 again,
   * through the one door it did not close.
   *
   * No extra request: `UserProvider` has already asked `/auth/me` for the whole
   * app, and this only reads the answer.
   */
  const { user, isLoading: sessionLoading, hadSession } = useUser();
  const sessionSaysVerified = user?.emailVerified === true;
  // Still worth waiting for: a marker says this browser has been signed in, so
  // the answer is coming and may well turn a red screen green. Without a marker
  // there is nothing to wait for, and a signed-out visitor must not be held.
  const sessionPending = sessionLoading && hadSession;

  // Auto-Redirect Timer State
  const [countdown, setCountdown] = React.useState(5);

  // Resend Cooldown Timer State
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);
  // The address to resend to. Asked for, because a failed token gives us no
  // session and no verified claim to read one from.
  const [resendEmail, setResendEmail] = React.useState('');
  const [resendError, setResendError] = React.useState<string | null>(null);
  const [isResending, setIsResending] = React.useState(false);

  /*
   * One attempt per token per mount.
   *
   * The token is SINGLE-USE, and this effect had no guard — so React's
   * development StrictMode, which mounts every component twice on purpose, ran
   * it twice and the second call overwrote the success with a failure.
   *
   * A ref rather than state: it must not itself trigger a render, and it must
   * survive the re-render the request causes before it returns. Keyed on the
   * token so a genuinely different link still gets its own attempt.
   *
   * ⚠️ It is per-MOUNT, and that was the hole. A refresh, a restored tab, or a
   * Back navigation resets it and re-POSTs a token that has already been
   * redeemed. That is fixed in two places that do not depend on each other:
   * the API now answers `already_verified` instead of 400 (auth.service.ts),
   * and the token is stripped from the URL the moment it resolves, below.
   * Either alone would do; both, because this screen is the first thing a new
   * client ever sees and the second one is free.
   */
  const attempted = React.useRef<string | null>(null);

  React.useEffect(() => {
    async function executeVerification() {
      if (!token) {
        /*
         * No token in the URL. Before concluding that something is wrong, ask
         * the two things that might already know the address is confirmed:
         * THIS TAB (the success path strips the token and lands here on purpose
         * — see `rememberOutcome`), and failing that the SESSION.
         *
         * The session answer may still be in flight, so this branch can end in
         * `verifying` and be reached again by the effect below. "We do not know
         * yet" must not render as "something went wrong".
         *
         * The functional update is not a style choice. This effect re-runs when
         * the token LEAVES the URL, which is something this screen does to
         * itself — so without the guard, stripping the token overwrote whatever
         * had just been concluded with "the token is missing". A conclusion
         * already reached must never be downgraded by a URL change.
         */
        setOutcome((prev) => (prev.kind !== 'verifying' ? prev : (recallOutcome() ?? prev)));
        return;
      }

      try {
        const result = await api.auth.verifyEmail(token);
        /*
         * Branch on `status`, never on `message`. The message is prose, and it
         * is translated (FSD §10 / D-16) — the portal used to decide what to
         * render by matching English, which is the defect `apiErrorCode` exists
         * to end.
         */
        const settled: Outcome =
          result.status === 'already_verified' ? { kind: 'already' } : { kind: 'verified' };
        rememberOutcome(settled);
        setOutcome(settled);
      } catch (err: unknown) {
        setOutcome(refusalOutcome(err));
      }
    }

    if (attempted.current === token) return;
    attempted.current = token;
    void executeVerification();
  }, [token]);

  /*
   * Settle the TOKENLESS arrival from what the SESSION says.
   *
   * Derived during render rather than stored: it is a function of the redemption
   * state and the session answer, and a second copy in state could only ever
   * disagree with them. It also arrives on the FIRST render that has the answer,
   * with no effect pass in between painting the wrong screen briefly.
   *
   * Three outcomes, and the order is the point:
   *
   *   signed in + verified   → `already`. The client is fine and is told so,
   *                            with the same way onward as a fresh success.
   *   still asking           → keep waiting. Never a red screen on "unknown".
   *   no session, or not     → the honest refusal, unchanged. Nobody here can
   *   verified                 tell us who they are, so a resend form is the
   *                            right ending.
   *
   * Only ever UPGRADES a `verifying`, so it cannot overwrite a real
   * verification, a real expiry or a throttle that has already been concluded.
   */
  /*
   * ⚠️ NO VERDICT BEFORE THE BROWSER HAS BEEN ASKED — reported from local
   * testing: the screen said "Verification Failed · token is missing" for a
   * moment, then "Already verified".
   *
   * The tab's memory is `sessionStorage`, which the SERVER cannot read, and it
   * was consulted in an effect — after the first paint. So a tokenless arrival
   * (a refresh, or Back, once the token had been stripped) painted the refusal
   * from the server's HTML and corrected itself a frame later. Somebody who is
   * verifying an email is not signed in yet, so the session could not hold the
   * screen either.
   *
   * Now: until this is running in a browser, the answer is "still checking"
   * (the neutral spinner, identical on the server and at hydration), and once
   * it is, the tab's memory is read DURING render — so the first frame with a
   * verdict is the right one.
   */
  const hydrated = useHydrated();
  const recalled = hydrated && !token ? recallOutcome() : null;
  const outcome: Outcome =
    redeemed.kind !== 'verifying' || token || !hydrated || sessionPending
      ? redeemed
      : (recalled ??
        (sessionSaysVerified
          ? { kind: 'already' }
          : { kind: 'invalid', message: t('auth.verify.missingToken') }));

  /*
   * Settled, and settled WELL — the address is confirmed, however it got there.
   *
   * `already` counts: the client's next step is identical to a fresh
   * verification, so it earns the same countdown and the same button. Making
   * them find their own way out of a flow that did not go wrong would be a
   * worse ending than the one this change is fixing.
   */
  const settledOk = outcome.kind === 'verified' || outcome.kind === 'already';

  /*
   * Take the SPENT token out of the URL. Successes only.
   *
   * A token that failed was never spent, and stripping it cost more than it
   * bought: removing it re-runs the effect above with an empty token, which is
   * indistinguishable from arriving at this page with no link at all. That is
   * how a precise "this link has expired" became a generic "token is missing"
   * — one wrong red screen traded for another, which is the exact failure mode
   * this whole change exists to end.
   *
   * `replace`, not `push`, so the Back button leaves this screen rather than
   * re-entering it — and a refresh no longer re-POSTs a credential that has
   * already done its job. The token also stops sitting in the address bar,
   * where it reaches browser history, the next page's Referer, and anything
   * reading the tab title over a shoulder.
   *
   * Guarded on `token` so it fires once: the effect re-runs after the URL
   * changes, and `router.replace` on an already-clean URL would loop.
   */
  React.useEffect(() => {
    if (!token) return;
    if (!settledOk) return;
    router.replace('/auth/verify-email');
  }, [settledOk, token, router]);

  /*
   * The countdown COUNTS. It does not navigate.
   *
   * `router.push` used to live inside the `setCountdown` updater, and React runs
   * an updater during RENDER — so this navigated while another component was
   * rendering, which React reports as "Cannot update a component (`Router`)
   * while rendering a different component" and which StrictMode can run twice,
   * pushing the same entry twice. Counting and navigating are two jobs; the
   * effect below owns the second.
   */
  React.useEffect(() => {
    if (!settledOk) return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [settledOk]);

  /*
   * Leave when the count reaches zero.
   *
   * `replace`, not `push`, and it is the same argument the token-stripping
   * effect above makes: this screen is a step that has been COMPLETED, and
   * pushing it leaves it sitting in history for the Back button to re-enter.
   * A client who verifies, signs in, and then presses Back should walk out of
   * the flow, not back into its last screen.
   *
   * `/auth/login` is right for both audiences: a signed-out client gets the
   * form they need, and a signed-in one is moved on to their dashboard by
   * `proxy.ts` without the form ever being rendered.
   */
  React.useEffect(() => {
    if (!settledOk || countdown > 0) return;
    router.replace('/auth/login');
  }, [settledOk, countdown, router]);

  // Resend Cooldown Timer Effect
  React.useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  /*
   * Actually resends the email.
   *
   * This function used to set a 60-second cooldown and a hardcoded English
   * success message, and CALL NOTHING. A client whose verification email never
   * arrived — a corporate filter, a full mailbox, a typo'd address — clicked it,
   * was told a new one was on its way, and waited for something that was never
   * sent. Their account stays unverified, `EmailVerifiedGuard` blocks KYC and
   * payments, and the portal offers no other route: the only way out was to
   * contact support and persuade a human to intervene on an identity control.
   *
   * The address is asked for rather than assumed, because this screen is reached
   * from a link whose token has just FAILED — there is no session and no
   * verified claim to read an email from. `resend-verification` answers the same
   * whether or not the account exists (auth.service.ts), so collecting it here
   * leaks nothing.
   */
  const handleResendLink = async () => {
    if (!resendEmail) return;
    setResendMessage(null);
    setResendError(null);
    setIsResending(true);
    try {
      await api.auth.resendVerification(resendEmail);
      // The API's own generic wording, kept generic on purpose: it must not
      // confirm whether an account exists for that address.
      setResendMessage(t('auth.verify.resendSent'));
      setResendCooldown(60);
    } catch (err: unknown) {
      // A failure is shown, not swallowed. Telling someone an email was sent
      // when it was not is the defect this whole function exists to fix.
      setResendError(apiErrorMessage(err, t('auth.verify.resendFailed')));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell heading={t('auth.verify.heading')} subheading={t('auth.verify.tagline')}>
      <div className="space-y-6">
        <div className="text-center space-y-5">
          {outcome.kind === 'verifying' ? (
            <div className="py-8 space-y-4">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
                <Spinner size="lg" className="text-info" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{t('auth.verify.verifying')}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('auth.verify.verifyingBody')}
                </p>
              </div>
            </div>
          ) : settledOk ? (
            /*
             * BOTH successes render here, differing only in wording.
             *
             * `already` is not a lesser outcome dressed up: the address is
             * verified, which is the thing the client came here to achieve. It
             * gets the same green tick, the same countdown and the same button,
             * because the only honest difference is that it happened a moment
             * ago rather than just now.
             */
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 border border-success/20 text-success">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-success">
                  {outcome.kind === 'already'
                    ? t('auth.verify.alreadyTitle')
                    : t('auth.verify.verifiedTitle')}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {outcome.kind === 'already'
                    ? t('auth.verify.alreadyBody')
                    : t('auth.verify.verifiedBody')}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {t('auth.verify.redirecting', { seconds: countdown })}
              </div>

              <Button asChild className="w-full">
                <Link href="/auth/login">
                  <span>{t('auth.verify.signInNow')}</span>
                </Link>
              </Button>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="h-8 w-8" />
              </div>

              <div>
                {/*
                  An EXPIRED link and an invalid one are different problems with
                  different answers, and they used to share one red box reading
                  "Verification Failed". A client whose link had merely aged out
                  was told nothing they could act on.
                */}
                <h2 className="text-lg font-bold text-destructive">
                  {outcome.kind === 'expired' && t('auth.verify.expiredHeading')}
                  {outcome.kind === 'throttled' && t('auth.verify.throttledHeading')}
                  {outcome.kind === 'invalid' && t('auth.verify.failedHeading')}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {outcome.kind === 'expired' && t('auth.verify.expiredBody')}
                  {outcome.kind === 'throttled' && t('auth.verify.throttledBody')}
                  {outcome.kind === 'invalid' && outcome.message}
                </p>
              </div>

              {resendMessage && (
                <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
                  {resendMessage}
                </div>
              )}

              {resendError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  {resendError}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <label htmlFor="resend-email" className="sr-only">
                  {t('auth.verify.emailPlaceholder')}
                </label>
                <Input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.verify.emailPlaceholder')}
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="h-11"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleResendLink()}
                  loading={isResending}
                  /*
                   * The COOLDOWN is not a loading state — nothing is in flight,
                   * the client simply may not ask again yet — so it stays an
                   * explicit `disabled` beside `loading` rather than being folded
                   * into it. The sign-in screen's resend button already draws that
                   * line the same way.
                   *
                   * The old version spun the icon through the cooldown too, which
                   * said a request was running for sixty seconds after it had
                   * finished.
                   */
                  disabled={resendCooldown > 0 || !resendEmail}
                  className="w-full"
                >
                  {/*
                    Idle: the refresh mark. In flight: the shared `Spinner`, via
                    `loading`. Never `animate-spin`, which globals.css freezes
                    under reduce-motion — see ui/loader.tsx, which names this
                    exact pattern among the ones it replaced.
                  */}
                  {!isResending && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  {resendCooldown > 0
                    ? `Resend Link in ${resendCooldown}s`
                    : t('auth.verify.resendCta')}
                </Button>

                <Button asChild className="w-full">
                  <Link href="/auth/login">{t('auth.verify.backToSignIn')}</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      // The shared loader, `fullScreen` — see the note on app/auth/login/page.tsx
      // for why all four auth screens stopped hand-building this.
      fallback={<PageLoader label={t('common.loadingEllipsis')} fullScreen />}
    >
      <VerifyEmailForm />
    </React.Suspense>
  );
}
