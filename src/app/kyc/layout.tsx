'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const STEPS = [
  { num: 1, label: 'Personal Info', path: '/kyc/step/1' },
  { num: 2, label: 'ID Document', path: '/kyc/step/2' },
  { num: 3, label: 'Selfie', path: '/kyc/step/3' },
  { num: 4, label: 'Address Proof', path: '/kyc/step/4' },
  { num: 5, label: 'Review', path: '/kyc/step/5' },
];

export default function KycLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStep = STEPS.findIndex((s) => pathname.startsWith(s.path)) + 1 || 1;

  return (
    <div className="kyc-shell">
      {/* Header */}
      <header className="kyc-header">
        <Link href="/dashboard" className="kyc-logo">
          <span className="kyc-logo-mark">OX</span>
          <span className="kyc-logo-text">Share</span>
        </Link>
        <div className="kyc-header-tag">Identity Verification</div>
      </header>

      {/* Progress Bar */}
      <div className="kyc-progress-wrap">
        <div className="kyc-progress-bar">
          {STEPS.map((step) => {
            const done = step.num < currentStep;
            const active = step.num === currentStep;
            return (
              <div key={step.num} className={`kyc-step-node ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                <div className="kyc-step-circle">
                  {done ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span>{step.num}</span>
                  )}
                </div>
                <span className="kyc-step-label">{step.label}</span>
                {step.num < STEPS.length && <div className={`kyc-step-line ${done ? 'done' : ''}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="kyc-content">{children}</main>

      <style jsx>{`
        .kyc-shell {
          min-height: 100vh;
          background: radial-gradient(ellipse at 30% 0%, #0f2027 0%, #0a0f1e 60%);
          color: #f0f4ff;
          font-family: 'Inter', sans-serif;
        }
        .kyc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 40px;
          border-bottom: 1px solid rgba(99,130,255,0.15);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(10, 15, 30, 0.8);
        }
        .kyc-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
        .kyc-logo-mark {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 800;
          font-size: 1.4rem;
          letter-spacing: -0.05em;
        }
        .kyc-logo-text { color: #c7d2fe; font-weight: 600; font-size: 1rem; }
        .kyc-header-tag {
          font-size: 0.75rem;
          color: #7c87b4;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: rgba(99,130,255,0.1);
          border: 1px solid rgba(99,130,255,0.2);
          padding: 4px 12px;
          border-radius: 20px;
        }
        .kyc-progress-wrap {
          padding: 32px 40px 0;
          display: flex;
          justify-content: center;
        }
        .kyc-progress-bar {
          display: flex;
          align-items: flex-start;
          gap: 0;
          width: 100%;
          max-width: 680px;
        }
        .kyc-step-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          position: relative;
        }
        .kyc-step-circle {
          width: 36px; height: 36px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.85rem; font-weight: 600;
          border: 2px solid rgba(99,130,255,0.25);
          color: #7c87b4;
          background: rgba(15, 20, 40, 0.8);
          transition: all 0.3s ease;
          position: relative; z-index: 2;
        }
        .kyc-step-node.done .kyc-step-circle {
          background: linear-gradient(135deg, #6382ff, #a78bfa);
          border-color: transparent;
          color: white;
        }
        .kyc-step-node.active .kyc-step-circle {
          background: rgba(99,130,255,0.15);
          border-color: #6382ff;
          color: #a5b4fc;
          box-shadow: 0 0 0 4px rgba(99,130,255,0.15);
        }
        .kyc-step-label {
          margin-top: 8px;
          font-size: 0.7rem;
          color: #7c87b4;
          text-align: center;
          white-space: nowrap;
        }
        .kyc-step-node.active .kyc-step-label { color: #a5b4fc; }
        .kyc-step-node.done .kyc-step-label { color: #818cf8; }
        .kyc-step-line {
          position: absolute;
          top: 18px;
          left: calc(50% + 18px);
          right: calc(-50% + 18px);
          height: 2px;
          background: rgba(99,130,255,0.2);
          z-index: 1;
        }
        .kyc-step-line.done { background: linear-gradient(90deg, #6382ff, #a78bfa); }
        .kyc-content {
          max-width: 640px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }
        @media (max-width: 600px) {
          .kyc-header { padding: 16px 20px; }
          .kyc-progress-wrap { padding: 24px 16px 0; }
          .kyc-step-label { font-size: 0.6rem; }
        }
      `}</style>
    </div>
  );
}
