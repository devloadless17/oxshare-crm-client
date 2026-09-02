import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';
import { compareMoney, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/** Where a transfer can take money FROM. */
export type Source =
  { kind: 'wallet'; currency: string } | { kind: 'account'; account: TradingAccount };

/** One row of the step-one list, with what it is worth beside it. */
export interface SourceOption {
  key: string;
  source: Source;
  title: string;
  hint: string;
}

/**
 * The step-one list: every wallet, then every trading account.
 *
 * Pure, and extracted from `app/transfer/page.tsx` so the ordering rules below
 * are assertions rather than something you find by clicking through a
 * three-step money sheet.
 *
 * Wallets stay ahead of accounts — funding an account is the common direction,
 * and a client arriving from "Fund account" is looking for their wallet — but
 * within each group the largest balance leads, because that is the one most
 * likely to cover what they came to move. A wallet with nothing in it is still
 * listed: "you have no money here" differs from "this does not exist", and
 * hiding it would leave somebody hunting for a currency they hold.
 *
 * `compareMoney` — decimal.js — never `Number()`. These are decimal STRINGS;
 * the coercion is a lint error here and a text sort would put '9' above '100'.
 * `.slice()` first, because the arrays are React Query's cached objects and
 * sorting in place mutates what every other reader of those keys sees.
 */
export function buildTransferSources(
  wallets: readonly Wallet[],
  accounts: readonly TradingAccount[],
): { walletSources: SourceOption[]; accountSources: SourceOption[]; sources: SourceOption[] } {
  const walletSources: SourceOption[] = wallets
    .slice()
    .sort((a, b) => compareMoney(b.available, a.available))
    .map((w) => ({
      key: `wallet:${w.currency}`,
      source: { kind: 'wallet', currency: w.currency },
      title: t('transfer.walletLabel', { currency: w.currency }),
      /*
       * `available`, not `balance`: the difference is whatever is held against
       * a pending withdrawal, and offering that as transferable produces a
       * refusal the client cannot explain.
       */
      hint: t('money.availableBalance', { amount: formatMoney(w.available, w.currency) }),
    }));

  const accountSources: SourceOption[] = accounts
    .slice()
    .sort((a, b) => compareMoney(b.balance, a.balance))
    .map((a) => ({
      key: `account:${a.id}`,
      source: { kind: 'account', account: a },
      title: t('transfer.accountLabel', { login: a.login ?? t('accounts.loginPending') }),
      hint: t('money.availableBalance', { amount: formatMoney(a.balance, a.currency) }),
    }));

  /* Flat, only to resolve the selected key back to its source. */
  return { walletSources, accountSources, sources: [...walletSources, ...accountSources] };
}
