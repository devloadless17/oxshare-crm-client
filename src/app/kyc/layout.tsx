'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface StepItem {
  num: number;
  label: string;
  path: string;
}

const DEFAULT_STEPS: StepItem[] = [
  { num: 1, label: 'Personal Info', path: '/kyc/step/1' },
  { num: 2, label: 'ID Document', path: '/kyc/step/2' },
  { num: 3, label: 'Selfie', path: '/kyc/step/3' },
  { num: 4, label: 'Address Proof', path: '/kyc/step/4' },
  { num: 5, label: 'Review', path: '/kyc/step/5' },
];

export default function KycLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [steps, setSteps] = useState<StepItem[]>(DEFAULT_STEPS);

  useEffect(() => {
    api
      .get('/kyc/config')
      .then((res) => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          const dynamicSteps = res.data.map((s: { stepNumber: number; title: string }) => ({
            num: s.stepNumber,
            label: s.title,
            path: `/kyc/step/${s.stepNumber}`,
          }));
          setSteps(dynamicSteps);
        }
      })
      .catch(() => {});
  }, []);

  const isSubmittedPage = pathname.includes('/kyc/submitted');
  const currentStep = steps.findIndex((s) => pathname.startsWith(s.path)) + 1 || 1;

  return (
    <div className="kyc-shell">
      {/* Header */}
      <header className="kyc-header">
        <Link href="/dashboard" className="kyc-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/oxshare-mark.svg" alt="" className="kyc-logo-mark" />
          <span className="kyc-logo-text">OXShare</span>
        </Link>
        <div className="kyc-header-tag">Identity Verification</div>
      </header>

      {/* Progress Bar (Hidden on Submitted Page) */}
      {!isSubmittedPage && (
        <div className="kyc-progress-wrap">
          <div className="kyc-progress-bar">
            {steps.map((step) => {
              const done = step.num < currentStep;
              const active = step.num === currentStep;
              return (
                <div
                  key={step.num}
                  className={`kyc-step-node ${done ? 'done' : ''} ${active ? 'active' : ''}`}
                >
                  <div className="kyc-step-circle">
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2 7l3.5 3.5L12 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span>{step.num}</span>
                    )}
                  </div>
                  <span className="kyc-step-label">{step.label}</span>
                  {step.num < steps.length && (
                    <div className={`kyc-step-line ${done ? 'done' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="kyc-content">{children}</main>

      <style jsx>{`
        .kyc-shell {
          min-height: 100vh;
          background: var(--background);
          color: var(--foreground);
        }
        .kyc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 40px;
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
          background: color-mix(in srgb, var(--background) 88%, transparent);
        }
        .kyc-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          border-radius: 6px;
        }
        .kyc-logo:focus-visible {
          outline: 2px solid var(--ring);
          outline-offset: 2px;
        }
        .kyc-logo-mark {
          height: 26px;
          width: auto;
          display: block;
        }
        .kyc-logo-text {
          color: var(--foreground);
          font-weight: 600;
          font-size: 1rem;
          letter-spacing: 0.02em;
        }
        .kyc-header-tag {
          font-size: 0.75rem;
          color: var(--link);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: color-mix(in srgb, var(--primary) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
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
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 600;
          line-height: 1;
          text-align: center;
          border: 2px solid var(--border);
          color: var(--muted-foreground);
          background: var(--card);
          transition: all 0.3s ease;
          position: relative;
          z-index: 2;
        }
        .kyc-step-circle span {
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          margin: 0;
          padding: 0;
        }
        .kyc-step-node.done .kyc-step-circle {
          background: var(--primary);
          border-color: transparent;
          color: var(--primary-foreground);
        }
        .kyc-step-node.active .kyc-step-circle {
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          border-color: var(--ring);
          color: var(--link);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent);
        }
        .kyc-step-label {
          margin-top: 8px;
          font-size: 0.7rem;
          color: var(--muted-foreground);
          text-align: center;
          white-space: nowrap;
        }
        .kyc-step-node.active .kyc-step-label {
          color: var(--link);
        }
        .kyc-step-node.done .kyc-step-label {
          color: var(--foreground);
        }
        .kyc-step-line {
          position: absolute;
          top: 18px;
          left: calc(50% + 18px);
          right: calc(-50% + 18px);
          height: 2px;
          background: var(--border);
          z-index: 1;
        }
        .kyc-step-line.done {
          background: var(--primary);
        }
        .kyc-content {
          max-width: 640px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }
        @media (max-width: 600px) {
          .kyc-header {
            padding: 16px 20px;
          }
          .kyc-progress-wrap {
            padding: 24px 16px 0;
          }
          .kyc-step-label {
            font-size: 0.6rem;
          }
        }
      `}</style>
    </div>
  );
}
