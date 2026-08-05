'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(t('auth.reset.missingToken'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.reset.mismatch'));
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, t('auth.reset.failed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell heading={t('auth.reset.heading')} subheading={t('auth.reset.tagline')}>
      <div className="space-y-6">
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-4 text-center space-y-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
              <h2 className="text-base font-bold text-success">{t('auth.reset.successTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('auth.reset.successBody')}</p>
              <Link
                href="/auth/login"
                className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover press focus-outline"
              >
                {t('auth.reset.signInCta')}
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="newPassword" className="text-xs font-semibold text-foreground">
                  {t('auth.reset.newPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('auth.login.passwordPlaceholder')}
                    className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-3 top-2.5 rounded text-muted-foreground transition-transform duration-100 active:scale-90 motion-reduce:transition-none motion-reduce:active:transform-none hover:text-foreground press focus-outline"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">
                  {t('auth.reset.confirmPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.login.passwordPlaceholder')}
                    className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('auth.reset.submitting')}</span>
                  </>
                ) : (
                  <span>{t('auth.reset.submitCta')}</span>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
          {t('common.loadingEllipsis')}
        </div>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
