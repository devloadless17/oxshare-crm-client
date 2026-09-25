'use client';

import * as React from 'react';
import { normaliseReferralCode } from '@/lib/referral-code';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, User, Eye, EyeOff, AlertCircle, Handshake } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { confirmEmailPath, rememberPendingEmail } from '@/lib/pending-email';
import { t } from '@/lib/i18n';
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/loader';

/**
 * Signed-out only, like the sign-in screen and for the same reason: this
 * rendered to a client who already had a session, and the account it would have
 * created is a second one under a different address on a device already holding
 * the first.
 */
export default function RegisterPage() {
  /*
   * The `<Suspense>` is required by `RedirectIfAuthenticated`, which calls
   * `useSearchParams()`. Next fails `next build` on that outside a boundary; this
   * page only builds today because `app/layout.tsx` reads `headers()` and makes
   * the tree dynamic, so the requirement is suppressed rather than met. See the
   * longer note on `app/auth/login/page.tsx`.
   */
  return (
    <React.Suspense
      // The shared loader, `fullScreen` — see the note on app/auth/login/page.tsx
      // for why all four auth screens stopped hand-building this.
      fallback={<PageLoader label={t('common.loadingEllipsis')} fullScreen />}
    >
      <RedirectIfAuthenticated>
        <RegisterForm />
      </RedirectIfAuthenticated>
    </React.Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  /*
   * `?ref=CODE` — the partner's referral link.
   *
   * Read here rather than stored, because attribution is decided once by the
   * API at registration and nothing about it needs to survive a reload. Safe
   * inside the `<Suspense>` this page already has for
   * `RedirectIfAuthenticated`.
   *
   * NORMALISED on the way in, by the same rule the API uses — this value is
   * both DISPLAYED to the client and SENT, so the two must agree about what
   * the code is.
   *
   * It said "the API trims and uppercases it too, so the two agree", and that
   * was true of the trimming and false of everything else. A client who typed
   * a backslash on the end of the address was shown `ABCD2345\` as their
   * referral code, it was sent as that, the API resolved nothing, and the
   * registration completed with no partner attached and nobody told.
   */
  const referralCode = normaliseReferralCode(useSearchParams().get('ref'));
  /*
   * ONE expression for every route out of this page, because the bug was a
   * route that did not use it. Built once and handed to both the mark and the
   * "Sign in" line.
   */
  const signInHref = referralCode
    ? `/auth/login?ref=${encodeURIComponent(referralCode)}`
    : '/auth/login';
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  /*
   * REGISTERED ALREADY — and the button must stay dead until the next screen.
   *
   * `isLoading` covers only the in-flight request. The success path used to
   * clear it and then wait SIX SECONDS on a confirmation before navigating, so
   * for those six seconds the form was live again with the same details in it.
   * Every further click was another `POST /auth/register` and another email to
   * the same address — reported from production as exactly that.
   *
   * The wait is gone (sign-up now goes straight to the code screen), but the
   * navigation is still not instant, and this flag is what keeps a second click
   * in that gap from registering twice. It never goes back to false — there is
   * nothing on this page left to do.
   */
  const [registered, setRegistered] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    /*
     * Guarded HERE too, not only by the disabled button. A disabled button
     * cannot be clicked, but Enter in a text field still submits the form in
     * some browsers, and this is the check that makes the rule true rather than
     * merely displayed.
     */
    if (isLoading || registered) return;
    setError(null);

    if (!email || !password || !firstName || !lastName) {
      setError(t('auth.register.fillRequired'));
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.register({
        email,
        password,
        firstName,
        lastName,
        // Omitted rather than sent empty when there is no `?ref=`. An empty
        // string is a value the API would have to interpret; absence is not.
        ...(referralCode ? { referralCode } : {}),
      });

      setRegistered(true);
      /*
       * Straight to the code (the client's request, 25 Sep 2026). The address
       * travels in this tab's storage, never the URL — see lib/pending-email.ts.
       *
       * The same screen is right whatever the server did with the address: a
       * new one has just been sent a code, and one that already held an account
       * has been sent a sign-in link instead — the response is identical by
       * design, and the code screen names both outcomes without choosing.
       *
       * `push`, not `replace`: "Back" from the code screen returns here, which is
       * where somebody who mistyped their address needs to be.
       */
      rememberPendingEmail(email);
      router.push(confirmEmailPath('register'));
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.register.failed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      heading={t('auth.register.heading')}
      subheading={t('auth.register.tagline')}
      /* The MARK carries the code too, not only the "Sign in" line below.
         Clicking the logo is the same detour through a different control. */
      homeHref={signInHref}
    >
      <div className="space-y-6">
        <div className="space-y-5">
          {/*
            Shown, not hidden in a query string.

            Attribution is permanent — this decides which partner is paid on
            this client's activity for the life of the account — so the client
            should be able to see it before they sign up rather than discover it
            afterwards. It is deliberately not an editable field: a code is
            something you arrive with, not something to guess at.

            An unrecognised code still shows here and the API still registers
            them, unattributed. Verifying it first would mean a request before
            the form is even filled in, to tell a client something they can do
            nothing about.
          */}
          {referralCode && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
              <Handshake className="h-4 w-4 shrink-0 text-link" aria-hidden="true" />
              <span className="text-muted-foreground">
                {t('auth.register.referredBy')}{' '}
                <span className="font-mono font-semibold tracking-wide text-foreground">
                  {referralCode}
                </span>
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-xs font-semibold text-foreground">
                  {t('auth.register.firstName')}
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('auth.register.firstNamePlaceholder')}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-xs font-semibold text-foreground">
                  {t('auth.register.lastName')}
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('auth.register.lastNamePlaceholder')}
                    className="h-11 pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground">
                {t('auth.register.email')}
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.login.emailPlaceholder')}
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-foreground">
                {t('auth.register.password')}
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  className="h-11 pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-3 top-3 cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-outline"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Still "working" once registered: the next screen is loading, and
                a button that springs back to "Create account" in that gap is
                an invitation to press it again. */}
            <Button
              type="submit"
              loading={isLoading || registered}
              disabled={registered}
              size="lg"
              className="w-full"
            >
              {isLoading || registered
                ? t('auth.register.submitting')
                : t('auth.register.submitCta')}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t('auth.register.hasAccount')}{' '}
          {/*
            CARRIES THE REFERRAL CODE, and that is not tidiness.

            `?ref=` is read from the URL and never stored — see the comment on
            `referralCode` above, which says nothing about it needs to survive a
            reload. It needs to survive ONE LINK. A client who follows a
            partner's link, thinks they already have an account, clicks here,
            finds they do not and comes back through the login page's own
            "create an account" link lands on a BARE /auth/register: the banner
            silently disappears and they register attributed to nobody.

            That is permanent. `referredByIbUserId` is written once at
            registration and there is no route, service method or admin screen
            anywhere that can set it afterwards — so a partner loses that client
            for good, and nothing records that it happened.
          */}
          <Link
            href={signInHref}
            className="font-semibold text-link hover:underline rounded-xs focus-outline"
          >
            {t('auth.register.signIn')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
