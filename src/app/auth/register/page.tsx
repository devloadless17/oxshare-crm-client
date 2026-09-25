'use client';

import * as React from 'react';
import { normaliseReferralCode } from '@/lib/referral-code';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, User, Eye, EyeOff, AlertCircle, Handshake, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage, apiFieldErrors } from '@/lib/api/errors';
import { confirmEmailPath, rememberPendingEmail } from '@/lib/pending-email';
import {
  ACCOUNT_FIELDS,
  EMPTY_REGISTER_VALUES,
  REQUIRED_DETAIL_FIELDS,
  firstErrorField,
  missingFields,
  registerPayload,
  stepOf,
  type RegisterField,
  type RegisterValues,
} from '@/lib/register-form';
import { t } from '@/lib/i18n';
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated';
import { AuthShell } from '@/components/auth/auth-shell';
import {
  RegisterDetailsStep,
  usePrefetchProfileOptions,
} from '@/components/auth/register-details-step';
import { StepIndicator, TextField } from '@/components/auth/register-fields';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loader';

type FieldErrors = Partial<Record<RegisterField, string>>;

/** Loose on purpose — the server is the judge; this only catches a missing "@". */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

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
  /*
   * TWO STEPS, ONE FORM (the client's request, 25 Sep 2026): the account, then
   * the personal details the identity verification opens with — so nobody
   * types their details twice. Both steps are one set of values, sent once;
   * going Back loses nothing. See `lib/register-form.ts` for which rules live
   * here (what the screen needs) and which do not (everything the server
   * judges).
   */
  const [step, setStep] = React.useState<1 | 2>(1);
  const [values, setValues] = React.useState<RegisterValues>(EMPTY_REGISTER_VALUES);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [showPassword, setShowPassword] = React.useState(false);
  // The server's lists, fetched while the client is still on step 1 so step 2
  // never opens on a spinner. Public and the same for everybody.
  usePrefetchProfileOptions();
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

  /*
   * Where the keyboard goes when the screen changes under it: the first field
   * in trouble, or else the first field of the step just opened. Without it a
   * keyboard or screen-reader user presses Continue and is left on a button
   * that no longer exists.
   */
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusTarget) return;
    const target =
      document.getElementById(focusTarget) ??
      document.querySelector<HTMLElement>(`[aria-label="${t('auth.register.phone')}"]`);
    target?.focus();
    target?.scrollIntoView?.({ block: 'center' });
  }, [focusTarget, step]);

  const update = (field: RegisterField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // An edited field has been answered; its old sentence no longer applies.
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const showErrors = (errors: FieldErrors) => {
    setFieldErrors(errors);
    const first = firstErrorField(errors);
    if (!first) return;
    setStep(stepOf(first));
    setFocusTarget(first);
  };

  /** Step 1 → 2, once the account fields are there to send. */
  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: FieldErrors = {};
    for (const field of missingFields(values, ACCOUNT_FIELDS)) {
      errors[field] = t('auth.register.required');
    }
    if (!errors.email && !LOOKS_LIKE_EMAIL.test(values.email.trim())) {
      errors.email = t('auth.register.emailInvalid');
    }
    if (!errors.password && values.password.length < MIN_PASSWORD) {
      errors.password = t('auth.register.passwordHint');
    }
    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      return;
    }
    // The account step's sentences are answered; a refusal the server gave
    // about a DETAIL still stands, and stays under its box on the next step.
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => stepOf(field) === 2)),
    );
    setStep(2);
    setFocusTarget('dateOfBirth');
  };

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

    const missing = missingFields(values, REQUIRED_DETAIL_FIELDS);
    if (missing.length > 0) {
      showErrors(Object.fromEntries(missing.map((f) => [f, t('auth.register.required')])));
      return;
    }

    setIsLoading(true);

    try {
      // Blank optional fields and an absent `?ref=` are OMITTED, not sent
      // empty: absence means "not given", and an empty string is a value the
      // API would have to interpret.
      await api.auth.register(registerPayload(values, referralCode));

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
      rememberPendingEmail(values.email.trim());
      router.push(confirmEmailPath('register'));
    } catch (err: unknown) {
      /*
       * The server answers per FIELD for anything it refuses — a name with a
       * digit, a phone nobody can dial, an under-18 date of birth — and each
       * sentence goes under its own box, on whichever step holds it. Only a
       * refusal about no field in particular becomes the banner.
       */
      const errors = apiFieldErrors(err) as FieldErrors;
      if (firstErrorField(errors)) {
        showErrors(errors);
        setError(t('auth.register.fixHighlighted'));
      } else {
        setError(apiErrorMessage(err, t('auth.register.failed')));
      }
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

          <StepIndicator step={step} />

          {step === 1 ? (
            <form onSubmit={handleContinue} noValidate className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  field="firstName"
                  label={t('auth.register.firstName')}
                  icon={User}
                  value={values.firstName}
                  error={fieldErrors.firstName}
                  onChange={update}
                  placeholder={t('auth.register.firstNamePlaceholder')}
                  autoComplete="given-name"
                  maxLength={100}
                />
                <TextField
                  field="lastName"
                  label={t('auth.register.lastName')}
                  icon={User}
                  value={values.lastName}
                  error={fieldErrors.lastName}
                  onChange={update}
                  placeholder={t('auth.register.lastNamePlaceholder')}
                  autoComplete="family-name"
                  maxLength={100}
                />
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                {t('auth.register.nameAsOnId')}
              </p>

              <TextField
                field="email"
                type="email"
                label={t('auth.register.email')}
                icon={Mail}
                value={values.email}
                error={fieldErrors.email}
                onChange={update}
                placeholder={t('auth.login.emailPlaceholder')}
                autoComplete="email"
              />

              <TextField
                field="password"
                type={showPassword ? 'text' : 'password'}
                label={t('auth.register.password')}
                icon={Lock}
                value={values.password}
                error={fieldErrors.password}
                hint={t('auth.register.passwordHint')}
                onChange={update}
                placeholder={t('auth.login.passwordPlaceholder')}
                autoComplete="new-password"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-3 top-3 cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-outline"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Button type="submit" size="lg" className="w-full">
                {t('auth.register.continue')}
              </Button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
              <RegisterDetailsStep values={values} errors={fieldErrors} onChange={update} />

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={isLoading || registered}
                  onClick={() => {
                    setError(null);
                    setStep(1);
                    setFocusTarget('firstName');
                  }}
                  className="sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t('auth.register.back')}
                </Button>
                {/* Still "working" once registered: the next screen is loading, and
                    a button that springs back to "Create account" in that gap is
                    an invitation to press it again. */}
                <Button
                  type="submit"
                  loading={isLoading || registered}
                  disabled={registered}
                  size="lg"
                  className="w-full sm:flex-1"
                >
                  {isLoading || registered
                    ? t('auth.register.submitting')
                    : t('auth.register.submitCta')}
                </Button>
              </div>
            </form>
          )}
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
