'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardPaste } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorCode, apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useUser } from '@/context/UserContext';
import { useHydrated } from '@/hooks/use-hydrated';
import { AuthShell } from '@/components/auth/auth-shell';
import { CODE_LENGTH, CodeInput, extractCode } from '@/components/auth/code-input';
import { ResendCode } from '@/components/auth/resend-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLoader } from '@/components/ui/loader';
import {
  forgetPendingEmail,
  recallPendingEmail,
  rememberPendingEmail,
  type ConfirmOrigin,
  type PendingEmail,
} from '@/lib/pending-email';
import { ONBOARDING_PATH, RETURN_TO_PARAM, safeReturnTo } from '@/lib/return-to';

/**
 * "Confirm your email" — the 6-digit code, and then you are in.
 *
 * Asked for by the client (25 Sep 2026): register, receive a code, type it, and
 * land signed in on "verify your identity now or later". The code signs the
 * client in because a person who can read the mailbox and is standing at the
 * screen that asked for the code is exactly who the password was set for a
 * minute ago — the server's `POST /auth/verify-email-code` does both in one
 * step and sets the session cookies exactly as sign-in does.
 *
 * ## Who arrives here, and what each is shown
 *
 *   from=register  just registered; the email is in this tab's storage
 *   from=login     signed in with the right password to an unconfirmed
 *                  account — the server has just mailed a fresh code
 *   signed in      an unconfirmed session (an operator changed the address);
 *                  `RequireAuth` sends them here, and the session knows who
 *   anyone else    a new tab or another device: asked for the address first,
 *                  and NOT sent a code for it — they may be holding a good one,
 *                  and a new code would kill it
 *
 * ## What the screen may never say
 *
 * Which addresses hold accounts. Every refusal from the server is the one code
 * `EMAIL_CODE_INVALID`, and the "already registered?" line names both outcomes
 * of a sign-up without committing to either — the same rule the registration
 * response follows.
 */
export default function ConfirmEmailPage() {
  return (
    <React.Suspense fallback={<PageLoader label={t('common.loadingEllipsis')} fullScreen />}>
      <ConfirmEmail />
    </React.Suspense>
  );
}

/** Wrong codes the server allows per code — `EMAIL_CODE_MAX_ATTEMPTS`. */
const MAX_ATTEMPTS = 5;

function ConfirmEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = originOf(searchParams.get('from'));
  // Checked before it is ever navigated to — it arrived in a URL.
  const destination = safeReturnTo(searchParams.get(RETURN_TO_PARAM), ONBOARDING_PATH);

  const { user, isLoading: sessionLoading, hadSession, refetchUser } = useUser();
  const hydrated = useHydrated();

  /*
   * The address being confirmed, in order of authority: one the client typed
   * or re-sent to on THIS screen, then the sign-up/sign-in hand-off, then an
   * unconfirmed session. Storage is read once hydrated — the server cannot see
   * it, and reading it in the first render would paint the wrong screen first.
   */
  const [chosen, setChosen] = React.useState<PendingEmail | null>(null);
  const remembered = React.useMemo(() => (hydrated ? recallPendingEmail() : null), [hydrated]);
  const sessionEmail = user && !user.emailVerified ? user.email : null;
  const target: PendingEmail | null =
    chosen ?? remembered ?? (sessionEmail ? { email: sessionEmail, sentAt: 0 } : null);

  const [code, setCode] = React.useState('');
  const [typedEmail, setTypedEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = React.useState(0);
  const [verifying, setVerifying] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const inFlight = React.useRef(false);
  const codeRef = React.useRef<HTMLInputElement>(null);

  const burned = wrongAttempts >= MAX_ATTEMPTS;

  /*
   * Already confirmed and signed in — a verified client who followed an old
   * link or pressed Back. There is nothing to type, so they go on. Not while a
   * confirmation of our own is completing: that navigation is already in hand,
   * and two `replace` calls racing is how a screen flickers between routes.
   */
  const alreadyConfirmed = !confirmed && user?.emailVerified === true;
  React.useEffect(() => {
    if (alreadyConfirmed) router.replace(destination);
  }, [alreadyConfirmed, destination, router]);

  /*
   * Back to the boxes whenever a new attempt is invited — after a refusal, and
   * when a new code is on its way — so it is typed straight in.
   *
   * Through an effect and a counter rather than a `.focus()` at the call site:
   * in the render that decides it the boxes may still be DISABLED (mid-request,
   * or locked after five wrong codes), and focusing a disabled input does
   * nothing, silently. The effect runs after the render that re-enables them.
   */
  const [invite, setInvite] = React.useState(0);
  React.useEffect(() => {
    if (invite > 0) codeRef.current?.focus();
  }, [invite]);

  const verify = async (candidate: string) => {
    if (!target || inFlight.current || confirmed || burned) return;
    if (candidate.length !== CODE_LENGTH) {
      setError(t('auth.confirm.incomplete'));
      return;
    }
    inFlight.current = true;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      await api.auth.verifyEmailCode({ email: target.email, code: candidate });
      setConfirmed(true);
      forgetPendingEmail();
      /*
       * The session BEFORE the navigation, as on sign-in: `UserProvider` stays
       * mounted across a client-side route change and its `/auth/me` already
       * settled as signed-out on this screen, so without this the next page
       * renders the signed-in shell with nobody in it.
       */
      await refetchUser();
      router.replace(destination);
    } catch (err: unknown) {
      setCode('');
      setInvite((n) => n + 1);
      if (apiErrorCode(err) === 'EMAIL_CODE_INVALID') {
        const failures = wrongAttempts + 1;
        setWrongAttempts(failures);
        setError(failures >= MAX_ATTEMPTS ? t('auth.confirm.burned') : t('auth.confirm.wrongCode'));
      } else {
        // A throttle says how long to wait; a suspension says so; a dropped
        // connection says that. Each is the server's own sentence.
        setError(apiErrorMessage(err, t('auth.confirm.failed')));
      }
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  };

  const paste = async () => {
    setNotice(null);
    try {
      const pasted = extractCode(await navigator.clipboard.readText());
      if (pasted.length !== CODE_LENGTH) {
        setError(t('auth.confirm.pasteNothing'));
        return;
      }
      setCode(pasted);
      await verify(pasted);
    } catch {
      // Permission refused, or a browser that asks and was told no.
      setError(t('auth.confirm.pasteDenied'));
    }
  };

  const onResent = (at: number) => {
    if (!target) return;
    const next = { email: target.email, sentAt: at };
    setChosen(next);
    rememberPendingEmail(next.email, at);
    setWrongAttempts(0);
    setCode('');
    setError(null);
    setNotice(t('auth.confirm.resent'));
    setInvite((n) => n + 1);
  };

  const onResendFailed = (err: unknown) => {
    setNotice(null);
    setError(apiErrorMessage(err, t('auth.confirm.resendFailed')));
    // Throttled: start the clock again rather than inviting another refusal.
    if (target && apiErrorCode(err) === 'RATE_LIMITED') {
      setChosen({ email: target.email, sentAt: Date.now() });
    }
  };

  const backHref = origin === 'register' ? '/auth/register' : '/auth/login';
  const leave = () => {
    // "Back" means this address is abandoned; the next screen must not offer it.
    forgetPendingEmail();
    router.push(backHref);
  };

  // Nothing is known until the browser has been asked — see `remembered`.
  if (!hydrated || (sessionLoading && hadSession) || alreadyConfirmed) {
    return <PageLoader label={t('common.loadingEllipsis')} fullScreen />;
  }

  const clipboardReadable =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  return (
    <AuthShell
      heading={t('auth.confirm.heading')}
      subheading={
        !target
          ? t('auth.confirm.askTagline')
          : origin === 'login'
            ? t('auth.confirm.loginTagline')
            : origin === 'register'
              ? t('auth.confirm.registerTagline')
              : t('auth.confirm.tagline')
      }
      footer={
        <button
          type="button"
          onClick={leave}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-outline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('auth.confirm.back')}
        </button>
      }
    >
      {!target ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const email = typedEmail.trim();
            if (!email) return;
            // No code is sent here — they may already hold a good one, and a new
            // code kills it. The resend button below is one tap away.
            setChosen({ email, sentAt: 0 });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="confirm-email-address">{t('auth.confirm.emailLabel')}</Label>
            <Input
              id="confirm-email-address"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              placeholder={t('auth.login.emailPlaceholder')}
              className="h-11"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!typedEmail.trim()}>
            {t('auth.confirm.askSubmit')}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void verify(code);
          }}
        >
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">{t('auth.confirm.sentTo')}</p>
            <p className="mt-0.5 break-all text-sm font-semibold text-foreground">{target.email}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="confirm-email-code">{t('auth.confirm.codeLabel')}</Label>
              {clipboardReadable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void paste()}
                  disabled={verifying || confirmed || burned}
                  className="-me-2 text-link"
                >
                  <ClipboardPaste aria-hidden="true" />
                  {t('auth.confirm.paste')}
                </Button>
              )}
            </div>
            <CodeInput
              ref={codeRef}
              id="confirm-email-code"
              value={code}
              onChange={(next) => {
                setCode(next);
                if (error) setError(null);
              }}
              onComplete={(full) => void verify(full)}
              disabled={verifying || confirmed || burned}
              invalid={Boolean(error)}
              autoFocus
              aria-describedby={error ? 'confirm-email-error' : 'confirm-email-hint'}
            />
          </div>

          {error && (
            <div
              id="confirm-email-error"
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success"
            >
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={verifying || confirmed}
            disabled={code.length !== CODE_LENGTH || burned}
          >
            {confirmed
              ? t('auth.confirm.confirmed')
              : verifying
                ? t('auth.confirm.submitting')
                : t('auth.confirm.submit')}
          </Button>

          <div className="space-y-3">
            <ResendCode
              email={target.email}
              sentAt={target.sentAt}
              disabled={verifying || confirmed}
              onSent={onResent}
              onFailed={onResendFailed}
            />
            <p id="confirm-email-hint" className="text-center text-xs text-muted-foreground">
              {t('auth.confirm.spamHint')}
            </p>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

/** Only the two values the sign-up and sign-in screens write; anything else is neither. */
function originOf(raw: string | null): ConfirmOrigin | null {
  return raw === 'register' || raw === 'login' ? raw : null;
}
