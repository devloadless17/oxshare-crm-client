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
import { keys, type PortalQueryKey } from '@/lib/query-keys';

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
/*
 * A payout SUMMARY: the amount and how many trades it covers.
 *
 * `count` is what separates "you were paid $148.08" from "you were paid $148.08
 * across 188 trades", and the second is the one a partner can reconcile. It
 * defaults to '1' so a row written before the summary change still reads as a
 * sentence rather than showing the placeholder.
 */
const payoutVars = (params: AppNotification['params']) => ({
  amount: formatMoney(str(params.amount), str(params.currency)),
  count: str(params.count) || '1',
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
  /*
   * REFUSED, with the reason — not `deposit.failed`.
   *
   * `deposit.failed` means the gateway did not complete and carries no reason;
   * its copy sends the client to start another deposit. An offline deposit that
   * is refused is a different fact: a person looked at the receipt and said no,
   * the client may well have sent the money, and the reason is the only thing
   * they can act on. It links to /transactions, where the reason and their own
   * receipt are.
   */
  'deposit.rejected': {
    icon: ArrowDownToLine,
    titleKey: 'notifications.kindDepositRejectedTitle',
    bodyKey: 'notifications.kindDepositRejectedBody',
    vars: (params) => ({
      amount: formatMoney(str(params.amount), str(params.currency)),
      reason: str(params.reason),
    }),
    href: '/transactions',
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
    vars: payoutVars,
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
    vars: payoutVars,
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
 * chiming. A client staring at a stale balance seconds after a "deposit
 * confirmed" toast is the exact contradiction this map removes.
 *
 * ⚠️ It removed it for deposits, withdrawals and transfers, and NOT for the
 * three kinds that are also wallet credits. `wallet.credited` (an operator
 * crediting an account by hand), `rebate.credited` and `commission.confirmed`
 * all fell through to `[]`, so the client got the chime, the toast and the
 * bell badge — and a wallet still showing the old balance underneath. That was
 * reported: "when I fund a wallet the result doesn't appear until I refresh."
 *
 * `rebate.credited` is the sharpest case, because this same file deep-links it
 * to /wallet: the client was sent to a screen chosen for showing the money,
 * which then did not show it.
 *
 * The return type is the registry's own union, so a key naming nothing is a
 * compile error. Do not widen it to `string[][]`.
 */
export function queryKeysFor(kind: string): readonly PortalQueryKey[] {
  /*
   * Everything that moves the balance. `wallet.` and the two commission kinds
   * join the money family here rather than getting a branch of their own,
   * because they change exactly the same three screens: a credit is a credit
   * however it was earned.
   *
   * `transactions.all()` covers the list under every filter the client may
   * have applied, and `dashboard.all()` the tiles, which are counted
   * server-side and so cannot be derived from either.
   */
  if (
    kind.startsWith('deposit.') ||
    kind.startsWith('withdrawal.') ||
    kind.startsWith('transfer.') ||
    kind.startsWith('wallet.') ||
    kind.startsWith('rebate.') ||
    kind.startsWith('commission.')
  ) {
    const money = [keys.wallets.all(), keys.transactions.all(), keys.dashboard.all()];
    /*
     * A commission or a rebate also restates what the partner screen reports
     * as earned — `GET /ib/overview` sums confirmed ledger entries, so the
     * lifetime figure and the commission balances both just moved.
     */
    return kind.startsWith('rebate.') || kind.startsWith('commission.')
      ? [...money, keys.partner.all()]
      : money;
  }

  // `kyc.all()` covers the status the sidebar badge, the dashboard card and
  // the outcome screen all share — one root since the registry landed.
  if (kind.startsWith('kyc.')) return [keys.kyc.all(), keys.dashboard.all()];

  /*
   * Approval, rejection, suspension and restoration all change what /partner
   * is allowed to render — an approved partner also has a commission wallet
   * opened for them, which the overview carries.
   */
  if (kind.startsWith('partner.')) return [keys.partner.all(), keys.dashboard.all()];

  /*
   * A new account belongs in the list AND in the transfer/deposit pickers,
   * which read `tradingAccounts.transferable()`. They share a root precisely
   * so this cannot refresh one and miss the other.
   */
  if (kind.startsWith('trading_account.')) {
    return [keys.tradingAccounts.all(), keys.dashboard.all()];
  }

  return [];
}

/**
 * Everything a MISSED event could have changed — what to refresh when the
 * socket comes back.
 *
 * A Socket.IO event reaches only a socket connected at that moment; there is
 * no replay. The reconnect used to refresh the bell alone, so a KYC rejection
 * that landed while the connection was down (the fifteen-minute token ceiling
 * forces one every quarter hour; a sleeping tab drops it too) put a row in the
 * bell and left the outcome screen reading "under review". Reported from
 * production as a rejection that did not arrive in real time.
 *
 * One representative kind per family, so this is exactly the union of what
 * `queryKeysFor` refreshes — never wider. In particular it never reaches
 * `mt5Live`: those reads are rate-limited per client and take the MT5 session
 * lock, and `notification-kinds.test.ts` pins that nothing bulk-invalidates
 * them. Only queries somebody is looking at refetch; the rest are just marked
 * stale.
 */
export function resyncKeysOnReconnect(): readonly PortalQueryKey[] {
  const families = ['kyc.', 'deposit.', 'commission.', 'partner.', 'trading_account.'];
  const seen = new Set<string>();
  const out: PortalQueryKey[] = [];
  for (const family of families) {
    for (const key of queryKeysFor(family)) {
      const id = JSON.stringify(key);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(key);
      }
    }
  }
  return out;
}

export function resolveKind(kind: string): KindConfig | undefined {
  // `Object.hasOwn`, not a bare lookup: a hostile or accidental kind slug of
  // 'constructor' or 'toString' would otherwise return an inherited function —
  // truthy — and skip the guaranteed generic fallback.
  return Object.hasOwn(KIND_CONFIG, kind) ? KIND_CONFIG[kind] : undefined;
}
