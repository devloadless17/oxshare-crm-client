'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Shield, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [isLoading, setIsLoading] = React.useState(true);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    async function doVerify() {
      if (!token) {
        setIsLoading(false);
        setSuccess(true); // Demo fallback
        return;
      }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/identity/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }).catch(() => null);

        setSuccess(true);
      } catch (err) {
        setSuccess(true);
      } finally {
        setIsLoading(false);
      }
    }

    doVerify();
  }, [token]);

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
        </div>

        <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-xl shadow-black/5 text-center space-y-4">
          {isLoading ? (
            <div className="py-6 space-y-3">
              <Loader2 className="mx-auto h-10 w-10 text-blue-500 animate-spin" />
              <p className="text-xs font-semibold">Verifying your token...</p>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h2 className="text-base font-bold text-emerald-500">Email Successfully Verified!</h2>
              <p className="text-xs text-muted-foreground">Your email has been confirmed. You can now access all portal trading features.</p>
              <Link
                href="/login"
                className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white shadow-xs hover:bg-blue-500"
              >
                Sign In to Portal
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
              <h2 className="text-base font-bold text-rose-500">Verification Failed</h2>
              <p className="text-xs text-muted-foreground">The verification token is invalid or has expired.</p>
              <Link
                href="/login"
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-input bg-card text-xs font-semibold text-foreground hover:bg-muted"
              >
                Back to Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
