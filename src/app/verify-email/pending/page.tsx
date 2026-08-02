'use client';

import { useState } from 'react';
import api from '@/lib/api';

export default function VerifyPendingPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    if (!email) return;
    setLoading(true);
    await api.post('/auth/resend-verification', { email }).catch(() => {});
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="pending-wrap">
      <div className="pending-card">
        <div className="pending-icon">📬</div>
        <h2>Check your inbox</h2>
        <p>We sent a verification link to your email address. Click the link to verify your account and get started.</p>
        <p className="note">Didn't receive it? Check your spam folder, or resend below.</p>

        {!sent ? (
          <div className="resend-form">
            <input
              className="resend-input"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="resend-btn" onClick={resend} disabled={loading || !email}>
              {loading ? 'Sending...' : 'Resend link'}
            </button>
          </div>
        ) : (
          <div className="sent-note">✓ Sent! Check your inbox again.</div>
        )}
      </div>

      <style jsx>{`
        .pending-wrap {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: radial-gradient(ellipse at 30% 0%, #0f2027 0%, #0a0f1e 60%);
          color: #f0f4ff;
        }
        .pending-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(99,130,255,0.2);
          border-radius: 24px; padding: 48px 40px; text-align: center; max-width: 420px; width: 90%;
        }
        .pending-icon { font-size: 3.5rem; margin-bottom: 20px; }
        h2 { font-size: 1.4rem; font-weight: 700; color: #e8eeff; margin-bottom: 12px; }
        p { color: #7c87b4; font-size: 0.9rem; line-height: 1.6; margin-bottom: 8px; }
        .note { font-size: 0.82rem; color: #5a6280; margin-bottom: 24px; }
        .resend-form { display: flex; flex-direction: column; gap: 12px; }
        .resend-input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(99,130,255,0.2);
          border-radius: 10px; padding: 12px 16px; color: #e8eeff; font-size: 0.93rem; outline: none;
        }
        .resend-btn {
          background: linear-gradient(135deg, #6382ff, #a78bfa); color: white;
          border: none; border-radius: 50px; padding: 13px 24px; font-weight: 600; cursor: pointer;
        }
        .resend-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sent-note { color: #4ade80; font-size: 0.9rem; font-weight: 600; }
      `}</style>
    </div>
  );
}
