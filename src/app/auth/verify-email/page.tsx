'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { AuthShell } from '@/components/auth/auth-shell';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [isLoading, setIsLoading] = React.useState(true);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

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
   * One attempt per token, ever.
   *
   * The token is SINGLE-USE, and this effect had no guard — so React's
   * development StrictMode, which mounts every component twice on purpose, ran
   * it twice: the first call verified the account and consumed the token, the
   * second found it already spent, got a 400, and overwrote the success with
   * "verification failed". The client was verified and told they were not, which
   * sends them back to request another link they do not need.
   *
   * A ref rather than state: it must not itself trigger a render, and it must
   * survive the re-render that `setIsLoading` causes before the request returns.
   * Keyed on the token so a genuinely different link still gets its own attempt.
   *
   * This is not only a development concern. Anything that loads the URL twice
   * hits the same wall — a refresh, a restored tab, or a corporate mail scanner
   * prefetching the link before the human clicks it.
   */
  const attempted = React.useRef<string | null>(null);

  React.useEffect(() => {
    async function executeVerification() {
      if (!token) {
        setIsLoading(false);
        setErrorMessage(t('auth.verify.missingToken'));
        return;
      }

      setIsLoading(true);

      try {
        await api.auth.verifyEmail(token);
        setIsSuccess(true);
      } catch (err: unknown) {
        setErrorMessage(apiErrorMessage(err, t('auth.verify.invalidToken')));
      } finally {
        setIsLoading(false);
      }
    }

    if (attempted.current === token) return;
    attempted.current = token;
    void executeVerification();
  }, [token]);

  // Auto-Redirect Countdown Timer Effect
  React.useEffect(() => {
    if (!isSuccess) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/auth/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSuccess, router]);

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
          {isLoading ? (
            <div className="py-8 space-y-4">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
                <Loader2 className="h-8 w-8 text-info animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{t('auth.verify.verifying')}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('auth.verify.verifyingBody')}
                </p>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 border border-success/20 text-success">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-success">{t('auth.verify.verifiedTitle')}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('auth.verify.verifiedBody')}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {t('auth.verify.redirecting', { seconds: countdown })}
              </div>

              <Link
                href="/auth/login"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover press focus-outline"
              >
                <span>{t('auth.verify.signInNow')}</span>
              </Link>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-destructive">
                  {t('auth.verify.failedHeading')}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {errorMessage || t('auth.verify.invalidToken')}
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
                <input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.verify.emailPlaceholder')}
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground press focus-outline"
                />
                <button
                  type="button"
                  onClick={() => void handleResendLink()}
                  disabled={resendCooldown > 0 || isResending || !resendEmail}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-outline cursor-pointer"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${resendCooldown > 0 || isResending ? 'animate-spin' : ''}`}
                  />
                  {resendCooldown > 0
                    ? `Resend Link in ${resendCooldown}s`
                    : t('auth.verify.resendCta')}
                </button>

                <Link
                  href="/auth/login"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover press focus-outline"
                >
                  {t('auth.verify.backToSignIn')}
                </Link>
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
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
          {t('common.loadingEllipsis')}
        </div>
      }
    >
      <VerifyEmailForm />
    </React.Suspense>
  );
}
