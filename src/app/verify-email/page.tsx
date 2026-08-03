'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token provided.'); return; }
    api.get(`/auth/verify-email?token=${token}`)
      .then((r) => { setStatus('success'); setMessage(r.data.message); setTimeout(() => router.push('/login'), 2500); })
      .catch((e) => { setStatus('error'); setMessage(e?.response?.data?.message ?? 'Verification failed.'); });
  }, [token, router]);

  return (
    <div className="verify-wrap">
      <div className="verify-card">
        {status === 'verifying' && (
          <>
            <div className="verify-spinner" />
            <h2>Verifying your email...</h2>
            <p>Please wait a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="verify-icon success">✓</div>
            <h2>Email Verified!</h2>
            <p>{message}</p>
            <p className="redirect-note">Redirecting to login...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="verify-icon error">✕</div>
            <h2>Verification Failed</h2>
            <p>{message}</p>
            <Link href="/verify-email/pending" className="verify-btn">Resend verification email</Link>
          </>
        )}
      </div>

      <style jsx>{`
        .verify-wrap {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: var(--background);
          color: var(--foreground);
        }
        .verify-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 48px 40px;
          text-align: center;
          max-width: 420px;
          width: 90%;
          animation: fadeIn 0.4s ease both;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } }
        .verify-spinner {
          width: 48px; height: 48px; margin: 0 auto 24px;
          border: 4px solid color-mix(in srgb, var(--primary) 25%, transparent);
          border-top-color: var(--primary); border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .verify-icon {
          width: 60px; height: 60px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 24px; font-size: 1.5rem; font-weight: 700;
        }
        .verify-icon.success {
          background: color-mix(in srgb, var(--success) 15%, transparent);
          color: var(--success);
          border: 2px solid color-mix(in srgb, var(--success) 30%, transparent);
        }
        .verify-icon.error {
          background: color-mix(in srgb, var(--destructive) 15%, transparent);
          color: var(--destructive);
          border: 2px solid color-mix(in srgb, var(--destructive) 30%, transparent);
        }
        h2 { font-size: 1.4rem; font-weight: 700; color: var(--foreground); margin-bottom: 12px; }
        p { color: var(--muted-foreground); font-size: 0.9rem; margin-bottom: 8px; line-height: 1.6; }
        .redirect-note { font-size: 0.8rem; color: var(--muted-foreground); margin-top: 12px; }
        .verify-btn {
          display: inline-block; margin-top: 20px;
          background: var(--primary);
          color: var(--primary-foreground); text-decoration: none; border-radius: 50px;
          padding: 12px 28px; font-weight: 600; font-size: 0.9rem;
        }
        .verify-btn:hover { background: var(--primary-hover); }
        .verify-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-xs text-muted-foreground">Loading...</div>}>
      <VerifyEmailContent />
    </React.Suspense>
  );
}
