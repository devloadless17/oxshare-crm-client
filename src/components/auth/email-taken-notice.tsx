'use client';

import Link from 'next/link';
import { AlertCircle, KeyRound, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { handEmailOver } from '@/lib/email-handoff';
import { t } from '@/lib/i18n';

/** The id sign-up moves the keyboard to when the panel opens. */
export const EMAIL_TAKEN_ACTION_ID = 'email-taken-reset';

/** The panel's own id — the email input names it in `aria-describedby`. */
export const EMAIL_TAKEN_NOTICE_ID = 'email-taken';

/**
 * "This email already has an account" — on the sign-up form, with the two ways
 * in: reset the password, or sign in.
 *
 * The owner's ruling (28 Sep 2026). Sign-up used to answer a taken address as if
 * it were new, so the client was sent to a code screen for a code that never
 * came, while an email told them the opposite. Now the form says it plainly and
 * the next step is one click away. Both buttons hand the typed address over
 * (`email-handoff.ts`), so it is not typed a third time.
 *
 * RED, under the password and right above Continue (owner, 28 Sep 2026). It was a brand-blue
 * panel between the email and password inputs, which read as a tip rather than
 * as the reason the form did not move on. It is the form's error now, and looks
 * like one: the same destructive tint as the form-level error banner.
 */
export function EmailTakenNotice({
  email,
  signInHref,
  onUseAnother,
}: {
  email: string;
  signInHref: string;
  onUseAnother: () => void;
}) {
  return (
    <div
      id={EMAIL_TAKEN_NOTICE_ID}
      role="alert"
      data-testid="email-taken"
      className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-destructive">{t('auth.register.emailTakenTitle')}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('auth.register.emailTakenBody', { email })}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="sm" className="sm:flex-1">
          <Link
            id={EMAIL_TAKEN_ACTION_ID}
            href="/auth/forgot-password"
            onClick={() => handEmailOver(email)}
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {t('auth.register.resetPassword')}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="sm:flex-1">
          <Link href={signInHref} onClick={() => handEmailOver(email)}>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {t('auth.register.signInInstead')}
          </Link>
        </Button>
      </div>
      <button
        type="button"
        onClick={onUseAnother}
        className="rounded-xs text-xs font-semibold text-link hover:underline focus-outline"
      >
        {t('auth.register.useAnotherEmail')}
      </button>
    </div>
  );
}
