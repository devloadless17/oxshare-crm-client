'use client';

import * as React from 'react';
import { normaliseReferralCode } from '@/lib/referral-code';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, isEmailUnverified } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useUser } from '@/context/UserContext';
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';
import { AuthShell } from '@/components/auth/auth-shell';

/**
 * Gated in the OTHER direction — see `RedirectIfAuthenticated`.
 *
 * This page rendered its form to a fully authenticated client, who could then
 * submit it and mint a second thirty-day session on top of their first. The
 * proxy now bounces them before this component runs; the wrapper is the
 * backstop for the case the proxy cannot see, where the cookie and the session
 * disagree.
 */
/**
 * The `<Suspense>` is required, not stylistic.
 *
 * `useSearchParams()` opts a component into client-side rendering, and Next
 * fails `next build` on a page that calls it outside a Suspense boundary
 * ("missing-suspense-with-csr-bailout"). This page builds today only because
 * `app/layout.tsx` is `async` and reads `headers()` for the CSP nonce, which
 * makes the whole tree dynamic and suppresses the check — so moving the nonce
 * anywhere else would break the build on the two busiest pages in the portal,
 * and the error would point at the layout rather than at either of them.
 *
 * `reset-password` and `verify-email` already wrap theirs; this brings the pair
 * that did not into line. `RedirectIfAuthenticated` calls `useSearchParams()`
 * too, so the boundary has to sit outside it rather than around `LoginForm`.
 */
export default function LoginPage() {
  return (
    <React.Suspense
      /*
       * `PageLoader`, not a centred line of text.
       *
       * All four auth screens had the same hand-built fallback — a flex div with
       * `text-xs text-muted-foreground` and the word "Loading…" — which is a
       * loading state that shares nothing with the loading state on every other
       * screen in the app. `ui/loader.tsx` is the one indicator here, and it
       * brings three things this did not: the shared spinner, `role="status"`
       * with `aria-live` so a screen reader is told the page is working, and a
       * mark that keeps moving under `prefers-reduced-motion`.
       *
       * `fullScreen`, because this replaces the whole page rather than a panel
       * inside one — the same variant `RequireAuth` and
       * `RedirectIfAuthenticated` use, which is what a visitor sees a moment
       * later if they turn out to be signed in.
       *
       * The label is SHOWN rather than `srOnly`. The gates hide theirs because
       * they are deliberately anonymous about whether a session exists; here
       * there is nothing to be coy about — the page is simply loading, and
       * saying so is better than a bare spinner.
       */
      fallback={<PageLoader label={t('common.loadingEllipsis')} fullScreen />}
    >
      <RedirectIfAuthenticated>
        <LoginForm />
      </RedirectIfAuthenticated>
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /* Read ONCE and normalised, so the mark and the "Create account" line cannot
     disagree about what the code is — the register page does the same. */
  const referralCode = normaliseReferralCode(searchParams.get('ref'));
  const { refetchUser } = useUser();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Resend Email State
  const [isUnverified, setIsUnverified] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [resendSuccess, setResendSuccess] = React.useState<string | null>(null);

  // Resend Cooldown Timer
  React.useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUnverified(false);
    setResendSuccess(null);

    if (!email || !password) {
      setError(t('auth.login.missingFields'));
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.login({ email, password });
      /*
       * Refetch the session BEFORE navigating — the admin twin does this
       * deliberately and asserts the ordering in its own test.
       *
       * `UserProvider` sits in the root layout and stays mounted across a
       * client-side navigation, so its `['user','me']` query is not remounted by
       * `router.push`. That query has already SETTLED — as a 401, with
       * `retry: false` and a five-minute `staleTime` — so without this the
       * portal lands on /dashboard with `user === null` and `isAuthenticated`
       * false, and renders the signed-in shell with no identity in it until a
       * window focus or the staleTime expiry happens to refetch.
       *
       * `router.refresh()` does not cover this: it re-fetches SERVER components
       * and never touches the React Query cache.
       */
      await refetchUser();
      /*
       * Back to where they were going, not to a fixed landing page.
       *
       * Every bounced visitor used to be dropped on /dashboard, so a client who
       * followed a link to /wallet, or whose session expired on
       * /kyc/step/3, signed in and then had to find their way back by hand. The
       * proxy attaches `?next=` when it redirects; this is the other half.
       *
       * `safeReturnTo` is not optional politeness. The parameter arrives in the
       * URL, so anyone can mail a client a sign-in link carrying any value at
       * all, and navigating to it unchecked would send someone to an
       * attacker's page in the instant after they typed their password. It
       * resolves the value and refuses anything that is not a same-origin path.
       */
      /*
       * `router.refresh()` used to follow this line and has been removed.
       *
       * It re-fetches SERVER components for the CURRENT route while a navigation
       * to a different one is already in flight — two renders racing, with the
       * loser's work discarded. It was there to make the freshly signed-in
       * session visible, and it never could: it does not touch the React Query
       * cache, which is where the session lives. `refetchUser()` above is what
       * actually does that job, which is why it is awaited before this line
       * rather than fired alongside it.
       */
      router.push(safeReturnTo(searchParams.get(RETURN_TO_PARAM)));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.login.failed')));

      // Branched on the ENGLISH TEXT of the message until the API published a
      // code (R-2.2). That worked only while the copy stayed exactly as written
      // and in English — so it would have silently stopped offering the resend
      // affordance the day Arabic shipped, which FSD §10 / D-16 require.
      if (isEmailUnverified(err)) {
        setIsUnverified(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!email || resendCooldown > 0) return;
    setIsResending(true);
    setResendSuccess(null);

    try {
      const res = await api.auth.resendVerification(email);
      setResendSuccess(res.message || t('auth.login.resendSuccess'));
      setResendCooldown(60);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.login.resendFailed')));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell
      heading={t('auth.login.heading')}
      subheading={t('auth.login.tagline')}
      /* The MARK keeps `?ref=` too. It points at this same page, so without
         this a visitor mid-detour loses the code by clicking the logo and the
         "Create account" line below then carries nothing. */
      homeHref={
        referralCode ? `/auth/login?ref=${encodeURIComponent(referralCode)}` : '/auth/login'
      }
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          {/*
            CARRIES `?ref=` BACK, completing the round trip.

            This page does nothing with a referral code — it is not read, not
            sent, not displayed. It is carried so that a visitor who arrived
            from a partner's link, detoured here, and goes back to register
            still has it. Without this the pair of links loses attribution
            silently: the register page's banner disappears and the client is
            attributed to nobody, permanently, since `referredByIbUserId` is
            written once at registration and no route anywhere can set it after.

            Passing a parameter a page ignores looks like dead code and is the
            opposite: it is the only reason the code survives the detour.
          */}
          <Link
            href={
              referralCode
                ? `/auth/register?ref=${encodeURIComponent(referralCode)}`
                : '/auth/register'
            }
            className="font-semibold text-link hover:underline rounded-xs focus-outline"
          >
            {t('auth.login.register')}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-3"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-px" aria-hidden="true" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>

            {isUnverified && (
              <div className="pt-2 border-t border-destructive/20">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleResendEmail()}
                  loading={isResending}
                  // Still explicitly disabled for the COOLDOWN, which is not a
                  // loading state — nothing is in flight, the client simply may
                  // not ask again yet. `loading` covers only the first case.
                  disabled={isResending || resendCooldown > 0}
                >
                  {isResending ? (
                    <span>{t('auth.login.resendSending')}</span>
                  ) : resendCooldown > 0 ? (
                    <span>{t('auth.login.resendCooldown', { seconds: resendCooldown })}</span>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t('auth.login.resendCta')}</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {resendSuccess && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{resendSuccess}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.login.emailLabel')}</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.login.emailPlaceholder')}
              className="h-11 pl-10"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">{t('auth.login.password')}</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.login.passwordPlaceholder')}
              className="h-11 pl-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              // Labelled, because the icon alone tells a screen-reader user
              // nothing and this button changes whether a password is on screen.
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-3 top-3 cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-outline"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {/*
            BELOW the field, right-aligned — where the broker's own site puts it,
            and where the eye lands after typing a password it is unsure of.
          */}
          <div className="flex justify-end">
            <Link
              href="/auth/forgot-password"
              className="text-xs font-medium text-link hover:underline rounded-xs focus-outline"
            >
              {t('auth.login.forgot')}
            </Link>
          </div>
        </div>

        <Button type="submit" loading={isLoading} size="lg" className="w-full">
          {isLoading ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
