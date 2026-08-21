'use client';

import { KycRouteGate } from '@/components/kyc/kyc-route-gate';
import { KycStepForm } from '@/components/kyc/kyc-step-form';
import { canOpenKycForm } from '@/lib/kyc-form-access';

/**
 * The KYC form, behind the route gate.
 *
 * `submitted`, `under_review` and `approved` go to the terminal screen — the
 * API refuses their writes anyway, so the form could only waste their time.
 * `rejected` renders: that is the whole point of the state, and the form
 * shows which fields were returned. Nothing paints until the status has
 * answered, so an approved client never sees their own onboarding form flash
 * up before being sent away. See components/kyc/kyc-route-gate.tsx.
 */
export default function KycStepPage() {
  return (
    <KycRouteGate allow={canOpenKycForm} redirectTo="/kyc/submitted">
      <KycStepForm />
    </KycRouteGate>
  );
}
