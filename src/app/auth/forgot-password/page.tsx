'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { ltr } from '@/lib/bidi';
import { takeHandedEmail } from '@/lib/email-handoff';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  /*
   * The address sign-up's "already has an account" panel handed over, so it is
   * not typed again (`email-handoff.ts`). Read in an effect, once: the server
   * rendered this box empty, and reading storage during render would disagree
   * with that HTML.
   */
  React.useEffect(() => {
    const handed = takeHandedEmail();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-shot read of browser storage the server could not see
    if (handed) setEmail(handed);
  }, []);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) return;

    setIsLoading(true);

    try {
      await api.auth.forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.forgot.failed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell heading={t('auth.forgot.heading')} subheading={t('auth.forgot.tagline')}>
      <div className="space-y-6">
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-4 text-center space-y-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
              <h2 className="text-base font-bold text-success">{t('auth.forgot.sentTitle')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('auth.forgot.sentBody', { email: ltr(email) })}
              </p>
              <Link
                href="/auth/login"
                className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-outline"
              >
                {t('auth.forgot.returnToSignIn')}
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-foreground">
                  {t('auth.register.email')}
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute start-3.5 top-3 h-4 w-4 text-muted-foreground"
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
                    className="h-11 ps-10"
                  />
                </div>
              </div>

              <Button type="submit" loading={isLoading} size="lg" className="w-full">
                {isLoading ? t('auth.forgot.sending') : t('auth.forgot.submitCta')}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1 font-semibold text-link hover:underline rounded-xs focus-outline"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" />
            <span>{t('auth.forgot.backToSignIn')}</span>
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
