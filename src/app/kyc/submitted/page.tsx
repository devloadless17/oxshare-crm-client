'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function KycSubmittedPage() {
  const [status, setStatus] = useState<string>('submitted');

  useEffect(() => {
    api.get('/kyc/status').then((r) => setStatus(r.data.status)).catch(() => {});
  }, []);

  return (
    <div className="submitted-wrap">
      <div className="submitted-card">
        <div className="submitted-icon">
          {status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳'}
        </div>
        <h2 className="submitted-title">
          {status === 'approved'
            ? 'KYC Approved!'
            : status === 'rejected'
            ? 'KYC Rejected'
            : 'Verification Submitted'}
        </h2>
        <p className="submitted-desc">
          {status === 'approved'
            ? 'Your identity has been verified. You now have full access to your account.'
            : status === 'rejected'
            ? 'Your KYC was not approved. Please review the reason and resubmit.'
            : 'Your documents are under review. This usually takes 1–2 business days. We\'ll notify you once the review is complete.'}
        </p>

        <div className="submitted-steps">
          <div className="submitted-step done">
            <div className="step-dot">✓</div>
            <div>
              <div className="step-step-title">Documents Submitted</div>
              <div className="step-step-sub">All required documents uploaded</div>
            </div>
          </div>
          <div className="submitted-step-line" />
          <div className={`submitted-step ${status === 'approved' || status === 'under_review' ? 'done' : 'pending'}`}>
            <div className="step-dot">{status === 'approved' ? '✓' : '2'}</div>
            <div>
              <div className="step-step-title">Under Review</div>
              <div className="step-step-sub">Compliance team is reviewing</div>
            </div>
          </div>
          <div className="submitted-step-line" />
          <div className={`submitted-step ${status === 'approved' ? 'done' : 'pending'}`}>
            <div className="step-dot">{status === 'approved' ? '✓' : '3'}</div>
            <div>
              <div className="step-step-title">Approved</div>
              <div className="step-step-sub">Account fully verified</div>
            </div>
          </div>
        </div>

        <Link href="/dashboard" className="back-btn">← Back to Dashboard</Link>
      </div>

      <style jsx>{`
        .submitted-wrap {
          display: flex; align-items: center; justify-content: center;
          min-height: 60vh;
        }
        .submitted-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(99,130,255,0.2);
          border-radius: 24px;
          padding: 48px 40px;
          text-align: center;
          max-width: 480px;
          width: 100%;
          animation: scaleIn 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) both;
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .submitted-icon { font-size: 4rem; margin-bottom: 20px; }
        .submitted-title { font-size: 1.6rem; font-weight: 700; color: #e8eeff; margin-bottom: 12px; }
        .submitted-desc { color: #7c87b4; font-size: 0.92rem; line-height: 1.7; margin-bottom: 36px; }

        .submitted-steps { display: flex; flex-direction: column; align-items: flex-start; gap: 0; margin-bottom: 36px; text-align: left; }
        .submitted-step { display: flex; align-items: center; gap: 16px; padding: 12px 0; }
        .submitted-step-line { width: 2px; height: 20px; margin-left: 15px; background: rgba(99,130,255,0.2); }
        .step-dot {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; font-weight: 700; flex-shrink: 0;
          background: rgba(99,130,255,0.1);
          border: 2px solid rgba(99,130,255,0.2);
          color: #7c87b4;
        }
        .submitted-step.done .step-dot {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          border-color: transparent; color: white;
        }
        .step-step-title { font-size: 0.88rem; font-weight: 600; color: #c7d2fe; }
        .step-step-sub { font-size: 0.78rem; color: #7c87b4; margin-top: 2px; }
        .submitted-step.pending .step-step-title { color: #5a6280; }

        .back-btn {
          display: inline-block;
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          color: white; text-decoration: none; border-radius: 50px;
          padding: 14px 32px; font-weight: 600; font-size: 0.95rem;
          transition: all 0.2s;
        }
        .back-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,130,255,0.35); }
      `}</style>
    </div>
  );
}
