'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ArrowRight, ChartCandlestick, Clock, Wallet } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loader';
import { useUser } from '@/context/UserContext';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { t } from '@/lib/i18n';
import { DEFAULT_SIGNED_IN_PATH } from '@/lib/return-to';

/**
 * "Complete your identity verification" — Verify now, or Verify later.
 *
 * Where a client lands the moment their email is confirmed (the client's
 * request, 25 Sep 2026). Step two of two: the ring reads 1/2 because the email
 * was the first, and the identity check is what is left before money can move.
 *
 * Standalone, not inside the portal chrome. It is a decision screen with two
 * answers, and a sidebar full of places to go is a third answer nobody asked
 * for — the same reason the reference design this follows has none.
 *
 * ## Only while there is something to decide
 *
 * A client whose identity check is approved, under review or refused has
 * nothing to decide here, so they are sent to the dashboard — whose KYC card
 * says precisely where they stand. Offering "Verify now" to somebody already
 * under review sends them into a wizard that refuses a submitted application,
 * which reads as the product having lost their documents.
 *
 * An unconfirmed email never reaches this screen: `RequireAuth` lists it in
 * `EMAIL_VERIFIED_PATHS`, because the identity check behind "Verify now" is
 * behind `EmailVerifiedGuard` on the server.
 */
export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}

function Onboarding() {
  const router = useRouter();
  const { user } = useUser();
  const kyc = useKycAccess();
  const nothingToDecide = !kyc.isLoading && (kyc.approved || kyc.pending || kyc.rejected);

  React.useEffect(() => {
    if (nothingToDecide) router.replace(DEFAULT_SIGNED_IN_PATH);
  }, [nothingToDecide, router]);

  // Held while the answer is in flight, and through the redirect: this pitch
  // must not flash for somebody it is about to be taken away from.
  if (kyc.isLoading || nothingToDecide) {
    return <PageLoader label={t('onboarding.checking')} srOnly fullScreen />;
  }

  const firstName = user?.firstName.trim();

  return (
    <main className="flex h-dvh overflow-y-auto bg-background">
      {/*
        Sized so BOTH answers sit above the fold on a 1280×720 laptop and a
        common phone — measured, not guessed: the first cut put "Verify now"
        one pixel under the fold at 720, which is the one control this screen
        exists to show.
      */}
      <div className="m-auto w-full max-w-lg px-5 py-8 sm:px-8">
        <div className="mb-5 flex justify-center">
          <BrandLogo />
        </div>

        <section
          aria-labelledby="onboarding-title"
          className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
        >
          <ProgressRing current={1} total={2} />

          <h1
            id="onboarding-title"
            className="mt-4 text-center text-2xl font-bold leading-tight tracking-tight text-foreground"
          >
            {t('onboarding.title')}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
            {firstName
              ? t('onboarding.welcome', { name: firstName })
              : t('onboarding.welcomeNoName')}{' '}
            {t('onboarding.body')}
          </p>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('onboarding.benefitsHeading')}
          </h2>
          <ul className="mt-3 space-y-2.5">
            <Benefit
              icon={Wallet}
              title={t('onboarding.benefitFundTitle')}
              body={t('onboarding.benefitFundBody')}
            />
            <Benefit
              icon={ChartCandlestick}
              title={t('onboarding.benefitLiveTitle')}
              body={t('onboarding.benefitLiveBody')}
            />
            <Benefit
              icon={ArrowLeftRight}
              title={t('onboarding.benefitTransferTitle')}
              body={t('onboarding.benefitTransferBody')}
            />
          </ul>

          <p className="mt-5 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('onboarding.duration')}
          </p>

          <div className="mt-5 space-y-2">
            <Button asChild size="lg" className="w-full">
              <Link href="/kyc">
                {t('onboarding.verifyNow')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            {/* `replace`: a client who chose "later" pressing Back should leave
                the flow, not be asked the same question again. */}
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link href={DEFAULT_SIGNED_IN_PATH} replace>
                {t('onboarding.verifyLater')}
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            {t('onboarding.laterHint')}
          </p>
        </section>
      </div>
    </main>
  );
}

function Benefit({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

/**
 * The "1/2" dial. Drawn, not an image: it follows the theme's own primary and
 * muted colours in light and dark, and costs no request.
 */
function ProgressRing({ current, total }: { current: number; total: number }) {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const done = Math.min(Math.max(current / total, 0), 1);

  return (
    <div
      role="img"
      aria-label={t('onboarding.progress', { current, total })}
      className="relative mx-auto"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          // `foreground/10`, not `muted`: the muted token is near-black on the
          // dark card, and the unfinished half of the dial vanished with it.
          className="stroke-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done)}
          className="stroke-primary"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums text-foreground"
      >
        {current}/{total}
      </span>
    </div>
  );
}
