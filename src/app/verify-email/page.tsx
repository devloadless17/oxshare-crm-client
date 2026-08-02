'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, CheckCircle2, AlertCircle, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';

export default function VerifyEmailPage() {
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

  React.useEffect(() => {
    async function executeVerification() {
      if (!token) {
        setIsLoading(false);
        setErrorMessage('Verification token is missing in URL parameters.');
        return;
      }

      setIsLoading(true);

      try {
        await api.auth.verifyEmail(token);
        setIsSuccess(true);
      } catch (err: any) {
        const msg = err?.response?.data?.message || err.message || 'Verification token is invalid or has expired.';
        setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
      } finally {
        setIsLoading(false);
      }
    }

    executeVerification();
  }, [token]);

  // Auto-Redirect Countdown Timer Effect
  React.useEffect(() => {
    if (!isSuccess) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/login');
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

  const handleResendLink = () => {
    setResendCooldown(60);
    setResendMessage('A new verification email has been dispatched. Please check your inbox.');
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Email Verification</h1>
          <p className="text-xs text-muted-foreground">OxShare Secure Account Verification</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-xl shadow-black/5 text-center space-y-5">
          {isLoading ? (
            <div className="py-8 space-y-4">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Verifying Token...</h3>
                <p className="text-xs text-muted-foreground mt-1">Please wait while we confirm your security credentials.</p>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-emerald-500">Email Verified Successfully!</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Your email address has been confirmed. You now have full access to your OxShare trading account.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Redirecting to sign-in page in <span className="font-bold text-blue-500">{countdown}s</span>...
              </div>

              <Link
                href="/login"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-xs font-semibold text-white shadow-md hover:bg-blue-500 transition-all"
              >
                <span>Sign In Now</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500">
                <AlertCircle className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-rose-500">Verification Failed</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {errorMessage || 'The verification link is invalid or has expired.'}
                </p>
              </div>

              {resendMessage && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-500">
                  {resendMessage}
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleResendLink}
                  disabled={resendCooldown > 0}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background text-xs font-semibold text-foreground hover:bg-muted transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0 ? `Resend Link in ${resendCooldown}s` : 'Resend Verification Email'}
                </button>

                <Link
                  href="/login"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
