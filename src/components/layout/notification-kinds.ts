import type * as React from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CandlestickChart,
  Handshake,
  Percent,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { t, type MessageKey } from '@/lib/i18n';
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
  /*
   * The CLIENT's leg, and it deliberately links to /wallet rather than /partner.
   *
   * A rebate is credited to the trading client's main wallet, and most of the
   * people receiving one are not partners at all — sending them to the partner
   * screen would be a dead end on the one notification that says they have been
   * paid.
   */
  'rebate.credited': {
    icon: Percent,
    titleKey: 'notifications.kindRebateCreditedTitle',
    bodyKey: 'notifications.kindRebateCreditedBody',
    vars: moneyVars,
    href: '/wallet',
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
  /*
   * The account is open and the credentials went to the client's MAILBOX, not
   * into this app — which is the whole reason this row exists. The one screen
   * that showed the confirmation renders it once, so a client who navigated
   * away had no in-app record that the account existed at all.
   *
   * The login travels because it is the number they will be asked for; no
   * password ever does.
   */
  'trading_account.opened': {
    icon: CandlestickChart,
    titleKey: 'notifications.kindTradingAccountOpenedTitle',
    bodyKey: 'notifications.kindTradingAccountOpenedBody',
    vars: (params) => ({ login: str(params.login), environment: str(params.environment) }),
    href: '/accounts',
  },
  /*
   * A transfer landed. TWO bodies, chosen by direction, because "transfer
   * completed" is the vaguest possible answer to "where is my money" — and a
   * transfer is the one movement here that is genuinely asynchronous from the
   * client's side, so this message is what closes the window in which their
   * money is visibly in neither place.
   */
  'transfer.completed': {
    icon: ArrowLeftRight,
    titleKey: 'notifications.kindTransferCompletedTitle',
    bodyKey: 'notifications.kindTransferCompletedBody',
    vars: (params) => ({
      amount: formatMoney(str(params.amount), str(params.currency)),
      /*
       * The DIRECTION as a translated phrase, resolved here rather than
       * interpolating the backend's enum. `wallet_to_account` is a database
       * value and would be shown to a client verbatim — and it cannot be
       * translated, which is the same reason no other raw slug reaches a
       * screen in this app. An unknown value yields `undefined`, so `t()`
       * leaves the placeholder visible instead of quietly saying nothing.
       */
      direction:
        params.direction === 'wallet_to_account'
          ? t('notifications.transferToAccount')
          : params.direction === 'account_to_wallet'
            ? t('notifications.transferToWallet')
            : undefined,
    }),
    href: '/transactions',
  },
};

/**
 * Which DATA a kind refreshes — what makes the portal live rather than merely
 * chiming. A deposit settling or a withdrawal being decided changes the
 * wallet, the transaction list and the dashboard's aggregates, and a client
 * staring at a stale balance seconds after the "deposit confirmed" toast is
 * the exact contradiction this map removes. Prefix-matched so new money kinds
 * inherit the behaviour before this map learns their names.
 */
export function queryKeysFor(kind: string): string[][] {
  if (
    kind.startsWith('deposit.') ||
    kind.startsWith('withdrawal.') ||
    kind.startsWith('transfer.')
  ) {
    return [['wallets'], ['transactions'], ['dashboard']];
  }
  if (kind.startsWith('kyc.')) return [['kyc-status'], ['dashboard']];
  return [];
}

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
