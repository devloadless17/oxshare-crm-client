'use client';

import { KycRouteGate } from '@/components/kyc/kyc-route-gate';
import { KycOutcome } from '@/components/kyc/kyc-outcome';
import { canOpenKycForm } from '@/lib/kyc-form-access';

/**
 * Where a finished submission lands: pending, approved, or returned with the
 * reason and a way back in.
 *
 * The gate is the mirror of the step route's. A client who has NOT submitted
 * anything has no outcome to read, so they are sent to the form — otherwise
 * this page tells someone who never started that their documents are under
 * review. `rejected` stays here: the form is open to them, but the reason and
 * the returned-field list are on this screen and the re-apply button is what
 * moves them. Same predicate as the step route, so the two cannot ping-pong.
 */
export default function KycSubmittedPage() {
  return (
    <KycRouteGate
      allow={(status) => !canOpenKycForm(status) || status === 'rejected'}
      redirectTo="/kyc/step/1"
    >
      <KycOutcome />
    </KycRouteGate>
  );
}
