'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Eye, EyeOff, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Resend Email State
  const [isUnverified, setIsUnverified] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [resendSuccess, setResendSuccess] = React.useState<string | null>(null);

  // Resend Cooldown Timer
  React.useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsUnverified(false);
    setResendSuccess(null);

    if (!email || !password) {
      setError('Please fill in both email and password.');
      return;
    }

    setIsLoading(true);

    try {
      await api.auth.login({ email, password, role: 'CLIENT' });
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Sign in failed. Please try again.';
      const formattedMsg = Array.isArray(msg) ? msg.join(', ') : msg;
      setError(formattedMsg);

      if (formattedMsg.toLowerCase().includes('verify your email')) {
        setIsUnverified(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!email || resendCooldown > 0) return;
    setIsResending(true);
    setResendSuccess(null);

    try {
      const res = await api.auth.resendVerification(email);
      setResendSuccess(res.message || 'Verification link resent! Check your inbox.');
      setResendCooldown(60);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to resend verification link.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/oxshare-mark.svg" alt="" className="h-8 w-auto" />
            <span className="text-xl font-semibold tracking-wide text-foreground">OXShare</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to OXShare</h1>
          <p className="text-xs text-muted-foreground">Sign in to your client trading portal</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-5">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{error}</span>
              </div>

              {isUnverified && (
                <div className="pt-2 border-t border-destructive/20">
                  <button
                    type="button"
                    onClick={handleResendEmail}
                    disabled={isResending || resendCooldown > 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground shadow-xs hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed focus-outline cursor-pointer"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : resendCooldown > 0 ? (
                      <span>Resend in {resendCooldown}s</span>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Resend Verification Email</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {resendSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{resendSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/auth/forgot-password" className="text-[11px] font-medium text-link hover:underline rounded-xs focus-outline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 rounded text-muted-foreground hover:text-foreground focus-outline"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="font-semibold text-link hover:underline rounded-xs focus-outline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
