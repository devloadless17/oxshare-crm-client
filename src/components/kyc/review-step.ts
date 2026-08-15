import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';

// Aliased from the generated schema, never hand-written — R-1.1.
type KycStepConfigDto = components['schemas']['KycStepConfigDto'];

/**
 * The terminator of the KYC flow, appended by the client rather than configured.
 *
 * `review` used to be a seeded row in `kyc_config_steps`, which made it editable
 * in the admin builder like any other step — and it is the one step that must
 * not be. This screen carries the button that submits the whole application: an
 * operator who deleted it left a flow with no way to finish, and one who dragged
 * it to position 2 left a flow that submits before collecting anything.
 * Migration 0070 removed the row.
 *
 * So `/kyc/config` now returns only the steps the broker genuinely chooses, and
 * this is added after them — always present, always last, whatever the builder
 * holds.
 */
export function withReviewStep(configured: KycStepConfigDto[]): KycStepConfigDto[] {
  // An empty flow gets no review screen either, or the client lands on "confirm
  // your details" having entered none.
  if (configured.length === 0) return configured;

  return [
    ...configured,
    {
      id: 'step-review',
      stepNumber: configured.length + 1,
      slug: 'review',
      title: t('kyc.reviewTitle'),
      description: t('kyc.reviewDescription'),
      icon: 'CheckSquare',
      enabled: true,
      fields: [],
    },
  ];
}
