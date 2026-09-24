import type { components } from '@/lib/api/types.gen';
import { t } from '@/lib/i18n';

type Owed = components['schemas']['KycOwedDto'];
type StepState = components['schemas']['KycStepStateDto'];

/**
 * What stops a step, in the order the client meets it: the first thing still
 * missing, else the first document the reviewer returned. `null` when nothing
 * does — the server's verdict (`kyc-step-state.ts`), read, never re-derived.
 */
export function firstOwed(state: StepState | undefined): Owed | null {
  if (!state) return null;
  return state.missing[0] ?? state.returned.find((item) => item.blocking) ?? null;
}

/**
 * The sentence for one owed item.
 *
 * `pending` is the one thing only the browser knows: a photo chosen and not yet
 * confirmed. For that slot the client needs "confirm it", not "upload one" —
 * they are looking at their own photo, and being asked for one is how that step
 * cost real time before.
 */
export function owedMessage(owed: Owed, pending: Readonly<Record<string, boolean>> = {}): string {
  switch (owed.kind) {
    case 'choice':
      return t('kyc.chooseDocument');
    case 'answer':
      return t('kyc.fieldRequired', { label: owed.label });
    case 'invalid':
      return owed.message ?? t('kyc.fieldRequired', { label: owed.label });
    case 'returned':
      return pending[owed.id]
        ? t('kyc.confirmChosenPhoto')
        : t('kyc.replaceReturnedItem', { label: owed.label });
    default:
      return pending[owed.id]
        ? t('kyc.confirmChosenPhoto')
        : t('kyc.needUpload', { label: owed.label });
  }
}
