'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useUser } from '@/context/UserContext';

/**
 * "We have emailed you a link" — the screen a client sits on after registering.
 *
 * ── Why this is Tailwind and not `<style jsx>` ──────────────────────────────
 *
 * It used to be styled-jsx, and styled-jsx injects its CSS from JavaScript at
 * runtime. So a hard refresh painted the raw document first: no styles at all,
 * the card full-width at the top-left, the emoji at text size. Measured rather
 * than guessed — sampling at `waitUntil: 'commit'` found `styleTags: 0` and the
 * card at `x:0, y:0, width:1280`. That flash is what a client sees every time
 * they reload while waiting for an email, which on this screen is often.
 *
 * Tailwind classes are in the stylesheet the document already links, so the
 * first paint is the finished one. `src/app/kyc/layout.tsx` is the only other
 * styled-jsx file left and has the same problem.
 *
 * ── Why it is no longer a dead end ──────────────────────────────────────────
 *
 * The page offered a resend box and NOTHING else — no link out, anywhere. A
 * Playwright probe put it plainly: `links: []`. Someone who mistyped their
 * address, or who verified in another tab, or who simply wanted to sign in as
 * somebody else, had the back button and no other option.
 *
 * A client who has just registered IS signed in (they are merely unverified), so
 * this screen already knows who it is waiting for. It says so, prefills the
 * resend box rather than asking them to retype an address the app can see, and
 * offers the two ways out that actually apply: sign in (for "I already
 * verified"), and sign out (for "that is the wrong address").
 */
export default function VerifyPendingPage() {
  const { user, logout } = useUser();
  /*
   * Prefilled from the session, and still editable.
   *
   * Editable because this page is also reachable by someone who is NOT signed
   * in — an old link, a second device — and for them the field is the only way
   * to identify themselves. `undefined` is not a valid initial value for a
   * controlled input, hence the empty-string fallback.
   */
  const [email, setEmail] = useState(user?.email ?? '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * `.catch(() => {})` used to sit on this call, and then `setSent(true)` ran
   * regardless — so a failed send showed the same confirmation as a successful
   * one. That is the pattern CLAUDE.md bans in this repo ("Do not add
   * `.catch(() => ({ data: [] }))`"), and here it produced the same harm as the
   * fake resend on /auth/verify-email: a client is told an email is on its way,
   * waits, and stays locked out of onboarding with no way to tell why.
   */
  const resend = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/resend-verification', { email });
      setSent(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.verify.resendFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        {/* Decorative: the heading beneath already says what this is. */}
        <div className="mb-5 text-6xl leading-none" aria-hidden="true">
          📬
        </div>

        <h1 className="mb-3 text-xl font-bold">{t('auth.verify.checkInbox')}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('auth.verify.pendingBodyLong')}
        </p>

        {/* Who we are waiting on — shown only when the session actually knows. */}
        {user?.email && (
          <p className="mt-3 text-sm font-medium break-all">
            {t('auth.verify.signedInAs', { email: user.email })}
          </p>
        )}

        <p className="mt-3 mb-6 text-xs text-muted-foreground">{t('auth.verify.spamHint')}</p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {!sent ? (
          <div className="flex flex-col gap-3">
            <label className="sr-only" htmlFor="resend-email">
              {t('auth.verify.emailPlaceholder')}
            </label>
            <input
              id="resend-email"
              className="rounded-lg border border-input bg-background px-4 py-3 text-sm focus-outline"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t('auth.verify.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-outline"
              onClick={() => void resend()}
              disabled={loading || !email}
            >
              {loading ? t('auth.verify.sending') : t('auth.verify.resendLink')}
            </button>
          </div>
        ) : (
          <div
            role="status"
            className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          >
            {t('auth.verify.resendConfirmed')}
          </div>
        )}

        {/*
          The way out. Both routes are offered because the two situations that
          strand people here are different: "I already verified" wants sign-in,
          and "that is the wrong address" needs the session cleared first —
          signing in as somebody else while still holding this one is how you end
          up back on this page.
        */}
        <div className="mt-6 border-t border-border pt-5 text-sm">
          <Link href="/auth/login" className="font-medium text-link hover:underline focus-outline">
            {t('auth.verify.alreadyVerified')}
          </Link>
          {user?.email && (
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 block w-full text-xs text-muted-foreground hover:underline focus-outline"
            >
              {t('auth.verify.wrongAddress')}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
