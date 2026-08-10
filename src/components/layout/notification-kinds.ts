import type * as React from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Handshake,
  Percent,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { MessageKey } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { AppNotification } from '@/lib/api/notifications';

/**
 * The portal bell's kind catalogue — how a backend `{kind, params}` row
 * becomes icon + copy + destination.
 *
 * The backend deliberately stores NO title, body or href (see the
 * `notifications` table note in the backend schema): copy lives here so it is
 * i18n'd like everything else, and the deep link is derived here so exactly
 * one place knows the route.
 *
 * A kind this map does not know renders as a generic row (`fallbackTitle` +
 * timestamp), never a raw slug — the backend may learn new events before this
 * app redeploys.
 *
 * TWIN in intent with the admin console's `layout/notification-kinds.ts`; NOT
 * a twin file — the catalogues are disjoint (account events here, work-queue
 * events there).
 */
export interface KindConfig {
  icon: React.ElementType;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /**
   * Interpolation vars for the body — money params go through formatMoney.
   *
   * A value may be `undefined`: `t()` then leaves the `{placeholder}` visible,
   * which is the deliberate failure mode (see `text` below).
   */
  vars?: (params: AppNotification['params']) => Record<string, string | number | undefined>;
  /** Where the client acts on or verifies the event. */
  href?: string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * A param the copy interpolates, or `undefined` so `t()` leaves the
 * `{placeholder}` visible.
 *
 * That visibility is deliberate — the i18n seam's own note says an unfilled
 * placeholder is an obvious bug while a silent empty string is one somebody
 * screenshots. `withdrawal.rejected` really can arrive with `reason: null`
 * (the backend encodes `reason ?? null`), and "…was declined: . The funds are
 * back in your balance" is exactly the sentence this avoids.
 */
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const moneyVars = (params: AppNotification['params']) => ({
  amount: formatMoney(str(params.amount), str(params.currency)),
});
const moneyReasonVars = (params: AppNotification['params']) => ({
  amount: formatMoney(str(params.amount), str(params.currency)),
  reason: text(params.reason),
});

export const KIND_CONFIG: Record<string, KindConfig> = {
  'deposit.succeeded': {
    icon: ArrowDownToLine,
    titleKey: 'notifications.kindDepositSucceededTitle',
    bodyKey: 'notifications.kindDepositSucceededBody',
    vars: moneyVars,
    href: '/transactions',
  },
  'deposit.failed': {
    icon: ArrowDownToLine,
    titleKey: 'notifications.kindDepositFailedTitle',
    bodyKey: 'notifications.kindDepositFailedBody',
    vars: moneyVars,
    href: '/deposit',
  },
  'wallet.credited': {
    icon: Wallet,
    titleKey: 'notifications.kindWalletCreditedTitle',
    bodyKey: 'notifications.kindWalletCreditedBody',
    vars: moneyReasonVars,
    href: '/wallet',
  },
  'withdrawal.approved': {
    icon: ArrowUpFromLine,
    titleKey: 'notifications.kindWithdrawalApprovedTitle',
    bodyKey: 'notifications.kindWithdrawalApprovedBody',
    vars: moneyVars,
    href: '/transactions',
  },
  'withdrawal.rejected': {
    icon: ArrowUpFromLine,
    titleKey: 'notifications.kindWithdrawalRejectedTitle',
    bodyKey: 'notifications.kindWithdrawalRejectedBody',
    vars: moneyReasonVars,
    href: '/transactions',
  },
  'withdrawal.paid': {
    icon: ArrowUpFromLine,
    titleKey: 'notifications.kindWithdrawalPaidTitle',
    bodyKey: 'notifications.kindWithdrawalPaidBody',
    vars: moneyVars,
    href: '/transactions',
  },
  'kyc.approved': {
    icon: ShieldCheck,
    titleKey: 'notifications.kindKycApprovedTitle',
    bodyKey: 'notifications.kindKycApprovedBody',
    href: '/dashboard',
  },
  'kyc.rejected': {
    icon: ShieldCheck,
    titleKey: 'notifications.kindKycRejectedTitle',
    bodyKey: 'notifications.kindKycRejectedBody',
    vars: (params) => ({ reason: text(params.reason) }),
    href: '/kyc',
  },
  'commission.confirmed': {
    icon: Percent,
    titleKey: 'notifications.kindCommissionConfirmedTitle',
    bodyKey: 'notifications.kindCommissionConfirmedBody',
    vars: moneyVars,
    href: '/partner',
  },
  'partner.approved': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerApprovedTitle',
    bodyKey: 'notifications.kindPartnerApprovedBody',
    href: '/partner',
  },
  'partner.rejected': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerRejectedTitle',
    bodyKey: 'notifications.kindPartnerRejectedBody',
    vars: (params) => ({ reason: text(params.reason) }),
    href: '/partner',
  },
  'partner.suspended': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerSuspendedTitle',
    bodyKey: 'notifications.kindPartnerSuspendedBody',
    href: '/partner',
  },
  'partner.restored': {
    icon: Handshake,
    titleKey: 'notifications.kindPartnerRestoredTitle',
    bodyKey: 'notifications.kindPartnerRestoredBody',
    href: '/partner',
  },
};

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
