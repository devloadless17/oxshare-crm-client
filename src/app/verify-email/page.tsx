'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function VerifyEmailPage() {
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
          background: radial-gradient(ellipse at 30% 0%, #0f2027 0%, #0a0f1e 60%);
          color: #f0f4ff;
        }
        .verify-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(99,130,255,0.2);
          border-radius: 24px;
          padding: 48px 40px;
          text-align: center;
          max-width: 420px;
          width: 90%;
          animation: fadeIn 0.4s ease both;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } }
        .verify-spinner {
          width: 48px; height: 48px; margin: 0 auto 24px;
          border: 4px solid rgba(99,130,255,0.2);
          border-top-color: #6382ff; border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .verify-icon {
          width: 60px; height: 60px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 24px; font-size: 1.5rem; font-weight: 700;
        }
        .verify-icon.success { background: rgba(34,197,94,0.15); color: #4ade80; border: 2px solid rgba(34,197,94,0.3); }
        .verify-icon.error { background: rgba(239,68,68,0.15); color: #f87171; border: 2px solid rgba(239,68,68,0.3); }
        h2 { font-size: 1.4rem; font-weight: 700; color: #e8eeff; margin-bottom: 12px; }
        p { color: #7c87b4; font-size: 0.9rem; margin-bottom: 8px; line-height: 1.6; }
        .redirect-note { font-size: 0.8rem; color: #5a6280; margin-top: 12px; }
        .verify-btn {
          display: inline-block; margin-top: 20px;
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          color: white; text-decoration: none; border-radius: 50px;
          padding: 12px 28px; font-weight: 600; font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
