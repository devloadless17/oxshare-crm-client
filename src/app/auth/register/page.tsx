'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';

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
      fallback={
        <div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">
          {t('common.loadingEllipsis')}
        </div>
      }
    >
      <RedirectIfAuthenticated>
        <RegisterForm />
      </RedirectIfAuthenticated>
    </React.Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  /*
   * The post-registration redirect, held so unmounting cancels it.
   *
   * A `setTimeout` that calls `router.push` outlives the component that started
   * it. Registering and then navigating anywhere within three seconds — to sign
   * in, to the home mark, via the back button — dropped the client back on
   * /auth/login from wherever they had reached, with nothing on screen
   * explaining it. React never warns about this; the navigation simply happens.
   */
  const redirectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email || !password || !firstName || !lastName) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.auth.register({
        email,
        password,
        firstName,
        lastName,
      });

      setSuccessMessage(
        res.message || 'Registration successful! Please check your email to verify your account.',
      );

      /*
       * Tracked so it can be cancelled — see the cleanup effect below.
       *
       * Unreferenced, this fired three seconds later wherever the client had got
       * to: click "sign in" or the OxShare mark within that window and you were
       * yanked back to /auth/login from the page you had just opened. The three
       * seconds exist to let somebody read the "check your email" message, not
       * to seize the navigation afterwards.
       */
      redirectTimer.current = setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell heading={t('auth.register.heading')} subheading={t('auth.register.tagline')}>
      <div className="space-y-6">
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-xs font-semibold text-foreground">
                  {t('auth.register.firstName')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('auth.register.firstNamePlaceholder')}
                    className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-xs font-semibold text-foreground">
                  {t('auth.register.lastName')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t('auth.register.lastNamePlaceholder')}
                    className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground">
                {t('auth.register.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.login.emailPlaceholder')}
                  className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-foreground">
                {t('auth.register.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.login.passwordPlaceholder')}
                  className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-3 top-2.5 cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus-outline"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} size="lg" className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('auth.register.submitting')}</span>
                </>
              ) : (
                <span>{t('auth.register.submitCta')}</span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t('auth.register.hasAccount')}{' '}
          <Link
            href="/auth/login"
            className="font-semibold text-link hover:underline rounded-xs focus-outline"
          >
            {t('auth.register.signIn')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
