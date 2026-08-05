'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { PortalLayout } from '@/components/layout/portal-layout';
import { RequireAuth } from '@/components/auth/require-auth';
import { t } from '@/lib/i18n';

type KycStepConfigDto = components['schemas']['KycStepConfigDto'];
type KycStatusDto = components['schemas']['KycStatusDto'];

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

/**
 * WHICH CHROME — from the pathname alone, and that is the whole point.
 *
 * This decision used to read the KYC status and the verification level. Both
 * arrive over the network, so the first paint committed to one shell and a later
 * paint replaced it with a different one: refreshing /kyc/submitted rendered the
 * bare wizard header, then swapped in the full portal — sidebar, topbar and all —
 * a few hundred milliseconds later. A layout that reflows its own chrome after
 * mount reads as a broken page, and no tuning of the condition fixes that while
 * an input is async.
 *
 * The pathname already carries the answer, because the shell follows what the
 * PAGE is for rather than who is looking at it:
 *
 *   'portal'  /kyc and /kyc/submitted. The client keeps the sidebar.
 *   'wizard'  /kyc/step/* — real onboarding. The focused shell earns its place:
 *             no sidebar, no distractions, one job.
 *
 * ## Why /kyc is 'portal' and not its own chrome-free state
 *
 * /kyc is a redirect stub: it reads the status and forwards to a step or to
 * /kyc/submitted. Giving it NO chrome looked principled — it is not a page —
 * and it was wrong for the same reason as the original bug, one step removed:
 * clicking "KYC Verification" in the sidebar navigated to /kyc, the sidebar
 * vanished for the length of one redirect, and came back on the next page.
 *
 * Something has to be on screen during that redirect, and the only choice that
 * never removes chrome the client is already looking at is the chrome they
 * arrived with. So the verified path is portal → portal → portal, with nothing
 * moving; the unverified path is portal → wizard, which is a deliberate entry
 * into a focused flow and reads as one.
 *
 * The general rule, which is what to keep: a transition may ADD focus, but it
 * must never take the surrounding UI away and give it back.
 *
 * A pure function, exported, so the mapping is asserted directly rather than
 * through a rendered tree — and so re-introducing an async input here means
 * changing a signature that tests are written against.
 */
export function kycShellFor(pathname: string): 'portal' | 'wizard' {
  return pathname.startsWith('/kyc/step') ? 'wizard' : 'portal';
}

/**
 * KYC needs the gate in BOTH of its shells, which is why it is here as well as
 * in `PortalLayout`.
 *
 * The wizard branch below does not render `PortalLayout`, so it would otherwise
 * be the one private area of the app outside the gate — and it is the area that
 * collects passport scans, selfies and addresses. Wrapping the whole layout
 * covers both branches; the nested `RequireAuth` inside `PortalLayout` on the
 * portal branch is a pass-through once the outer one has resolved.
 */
export default function KycLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <KycShell>{children}</KycShell>
    </RequireAuth>
  );
}

function KycShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  /*
   * KYC requires a verified email — FR-CORE-15 — and that gate now lives in
   * `RequireAuth`, driven by `EMAIL_VERIFIED_PATHS` declared alongside it.
   *
   * It was here, and it was correct here, but it was only here: /deposit,
   * /withdraw and /transactions sit behind the same `EmailVerifiedGuard` on the
   * backend and had no equivalent, so an unverified client could fill in a
   * withdrawal and have it refused on submit. One rule enforced in one place
   * beats the same rule re-derived per route, which is how the second, third
   * and fourth copies get forgotten.
   *
   * Worth keeping the history, because it is the reason the check is not in the
   * proxy: it used to read `emailVerified` off the JWT in the session cookie,
   * which worked while the guard was handed the ACCESS token, whose payload
   * carries the claim. When route gating moved to the refresh cookie —
   * correctly, so a returning client with a valid 30-day session is not bounced
   * to login — the claim went with it: the refresh token is signed from
   * `{ sub, jti }` and nothing else. `emailVerified` was `undefined` for
   * everyone, `!== true` was true for everyone, and every client who opened KYC
   * was redirected to the verify-email page. Verified ones included. Onboarding
   * was unreachable.
   *
   * `/auth/me` is the authority, which is why the gate reads it and nothing
   * else. The API enforces it again on every KYC endpoint, so the redirect is
   * for the human; the control is server-side.
   */
  const { user } = useUser();
  /*
   * Same ['kyc-config'] query key the step page uses, so react-query serves both
   * from one request. These were two independent fetches of /kyc/config on every
   * visit to a step.
   *
   * Falling back to DEFAULT_STEPS when the config is unavailable is deliberate and
   * is the one place in this repo where a fallback is right: this is the progress
   * rail, and showing generic step labels beside a page that is itself reporting
   * the error is better than a blank sidebar. The step page owns telling the user
   * something went wrong.
   */
  const config = useResource(
    ['kyc-config'],
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
  );

  const steps: StepItem[] =
    config.data && config.data.length > 0
      ? config.data.map((s) => ({
          num: s.stepNumber,
          label: s.title,
          path: `/kyc/step/${s.stepNumber}`,
        }))
      : DEFAULT_STEPS;

  const currentStep = steps.findIndex((s) => pathname.startsWith(s.path)) + 1 || 1;

  // Synchronous on the first render, so the right chrome is painted once and
  // never replaced. See kycShellFor above for why that matters.
  const shell = kycShellFor(pathname);

  /*
   * A verified client has no step to complete, so a step URL is a dead end —
   * `saveStep` throws for an approved submission, which would render as a form
   * that errors on submit.
   *
   * Handled by REDIRECTING rather than by swapping chrome: the destination
   * decides its own shell from its own pathname, so this cannot reintroduce the
   * flash. The redirect goes wizard → portal, which ADDS the sidebar rather than
   * removing it, so it stays on the right side of the rule above.
   *
   * Shares the ['kyc-status'] key with `/kyc` and the step pages, so react-query
   * serves all of them from one request — same reason ['kyc-config'] is shared
   * above.
   *
   * Either signal is enough, matching `kycNavBadge` in portal-layout.tsx so the
   * sidebar badge and this cannot disagree about whether the client is done.
   */
  const statusQuery = useResource(
    ['kyc-status'],
    async (signal) => (await api.get<KycStatusDto | null>('/kyc/status', { signal })).data ?? null,
  );
  const nothingLeftToDo = user?.verificationLevel === 1 || statusQuery.data?.status === 'approved';
  const strandedOnAStep = nothingLeftToDo && shell === 'wizard';

  useEffect(() => {
    if (strandedOnAStep) router.replace('/kyc/submitted');
  }, [strandedOnAStep, router]);

  if (shell === 'portal') {
    return <PortalLayout>{children}</PortalLayout>;
  }

  return (
    <div className="kyc-shell">
      {/* Header */}
      <header className="kyc-header">
        <Link href="/dashboard" className="kyc-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/oxshare-mark.svg" alt="" className="kyc-logo-mark" />
          <span className="kyc-logo-text">{t('app.name')}</span>
        </Link>
        <div className="kyc-header-tag">{t('kyc.layoutTitle')}</div>
      </header>

      {/* Progress rail. Unconditional now: shell 'none' and 'portal' both return
          above, so everything reaching here is a step — the `!isSubmittedPage`
          guard that used to wrap this could no longer be false. */}
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
