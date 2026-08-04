'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { t } from '@/lib/i18n';

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
        <h2>{t('auth.verify.checkInbox')}</h2>
        <p>{t('auth.verify.pendingBodyLong')}</p>
        <p className="note">{t('auth.verify.spamHint')}</p>

        {!sent ? (
          <div className="resend-form">
            <input
              className="resend-input"
              type="email"
              placeholder={t('auth.verify.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="resend-btn"
              onClick={() => void resend()}
              disabled={loading || !email}
            >
              {loading ? t('auth.verify.sending') : t('auth.verify.resendLink')}
            </button>
          </div>
        ) : (
          <div className="sent-note">{t('auth.verify.resendConfirmed')}</div>
        )}
      </div>

      <style jsx>{`
        .pending-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          color: var(--foreground);
        }
        .pending-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 48px 40px;
          text-align: center;
          max-width: 420px;
          width: 90%;
        }
        .pending-icon {
          font-size: 3.5rem;
          margin-bottom: 20px;
        }
        h2 {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 12px;
        }
        p {
          color: var(--muted-foreground);
          font-size: 0.9rem;
          line-height: 1.6;
          margin-bottom: 8px;
        }
        .note {
          font-size: 0.82rem;
          color: var(--muted-foreground);
          margin-bottom: 24px;
        }
        .resend-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .resend-input {
          background: var(--background);
          border: 1px solid var(--input);
          border-radius: 10px;
          padding: 12px 16px;
          color: var(--foreground);
          font-size: 0.93rem;
          outline: none;
        }
        .resend-input:focus {
          border-color: var(--ring);
        }
        .resend-btn {
          background: var(--primary);
          color: var(--primary-foreground);
          border: none;
          border-radius: 50px;
          padding: 13px 24px;
          font-weight: 600;
          cursor: pointer;
        }
        .resend-btn:hover:not(:disabled) {
          background: var(--primary-hover);
        }
        .resend-btn:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .resend-input:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 0;
          border-color: var(--ring);
        }
        .resend-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sent-note {
          color: var(--success);
          font-size: 0.9rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
