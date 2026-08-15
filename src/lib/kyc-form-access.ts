import type { components } from './api/types.gen';

export type KycStatus = components['schemas']['KycStatusDto']['status'];

/**
 * May a client in this state open the KYC FORM?
 *
 *   not_started / in_progress  → yes, it is theirs to fill in
 *   rejected                   → yes, and this is the point: they must be able
 *                                to fix what was returned and resubmit
 *   submitted / under_review   → no, the API refuses the write anyway
 *   approved                   → no, there is nothing left to submit
 */
export function canOpenKycForm(status: KycStatus | null): boolean {
  if (status === null) return true; // unknown — see the note on failing open
  return status === 'not_started' || status === 'in_progress' || status === 'rejected';
}
