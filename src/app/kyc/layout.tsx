'use client';

import './kyc-shell.css';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import type { components } from '@/lib/api/types.gen';
import { useResource } from '@/hooks/use-resource';
import { useUser } from '@/context/UserContext';
import { PortalLayout } from '@/components/layout/portal-layout';
import { RequireAuth } from '@/components/auth/require-auth';
import { t } from '@/lib/i18n';

type KycStepConfigDto = components['schemas']['KycStepConfigDto'];

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
  /*
   * Both queries below are gated on the email being verified.
   *
   * Every `/kyc/*` endpoint sits behind `EmailVerifiedGuard`, so for an
   * unverified client these are guaranteed 403s — fired on arrival, before the
   * redirect above has a chance to move them. Not fetching is the fix; catching
   * the error would just hide a request that should never have been made.
   */
  const kycReadable = user?.emailVerified === true;

  const config = useResource(
    ['kyc-config'],
    async (signal) => (await api.get<KycStepConfigDto[]>('/kyc/config', { signal })).data,
    { enabled: kycReadable },
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
   * ── THIS LAYOUT NO LONGER REDIRECTS, AND THAT FIXED AN INFINITE LOOP ─────
   *
   * It used to send a "verified" client off any step URL, deciding from
   * `user.verificationLevel === 1 || status === 'approved'` — EITHER signal.
   * The routes decide from KYC status alone, and the two disagree for a real
   * account: `hazimehussein01@gmail.com` is verificationLevel 1 with a KYC
   * submission still `not_started`.
   *
   * That is a permanent disagreement, not a race. The layout said "verified,
   * nothing to do" and pushed to /kyc/submitted; that route said "no outcome to
   * read" and pushed back to /kyc/step/1; the layout fired again. The client
   * ping-ponged between the two pages until the browser gave up.
   *
   * Routing now lives in the route segments themselves — `app/kyc/page.tsx`,
   * `app/kyc/step/[step]/page.tsx` and `app/kyc/submitted/page.tsx` — which
   * decide on the SERVER from one predicate (`canOpenKycForm`) before any HTML
   * is sent. A layout redirect cannot beat them and cannot disagree with them,
   * because it no longer exists.
   *
   * `verificationLevel` is still the right signal for the sidebar badge, which
   * is about what the client has ACHIEVED. It is the wrong signal for "may this
   * form be opened", which is about what the API will accept.
   */

  /*
   * Render NOTHING while bouncing an unverified client to the verify page.
   *
   * The redirect above is an effect, so it runs after this render — and the
   * children mount in the meantime and fire their own `/kyc/config` and
   * `/kyc/status` requests, each a guaranteed 403. Withholding the children is
   * what actually stops them, and it costs nothing: this render is replaced by
   * a navigation a moment later.
   */
  // Written from `user` rather than the `emailUnverified` const that used to
  // sit above: that const was removed when the gate moved to `RequireAuth`,
  // and the merge left this line referring to it. `user` is undefined while
  // the profile loads, and `undefined && ...` is correctly falsy - nothing is
  // withheld on an unanswered question, which is the bug this file has had
  // twice. `RequireAuth` redirects and withholds too, so this is now belt to
  // its braces; it stays because the reasoning above still holds and it costs
  // one comparison.
  if (user && !user.emailVerified) return null;

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
    </div>
  );
}
