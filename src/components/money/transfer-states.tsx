'use client';

import Link from 'next/link';
import { CheckCircle2, LineChart, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MethodTile, MoneySheet } from '@/components/money/money-shell';
import type { TradingAccount } from '@/lib/api/trading';
import type { Wallet } from '@/lib/api/wallet';
import { formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * The two ends of the transfer flow: nowhere to send money, and money sent.
 *
 * Lifted out of the page because they are the states with no form in them — the
 * page is the two-step form, and these are what it shows instead of one. Both
 * fill the card rather than sitting at the top of it, so the screen does not
 * change height on the way in or out.
 */

/**
 * No live account exists, so there is nothing to transfer to.
 *
 * Points at `/accounts` rather than explaining the rule: a client who has only
 * a demo account needs to open a live one, and the sentence that would explain
 * why demo is excluded is longer than the action is.
 */
export function TransferUnavailable() {
  return (
    <MoneySheet className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <LineChart className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">{t('transfer.noAccounts')}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {t('transfer.noAccountsBody')}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/accounts">{t('nav.accounts')}</Link>
        </Button>
      </div>
    </MoneySheet>
  );
}

/**
 * The transfer was accepted — which is not the same as completed.
 *
 * "Submitted" and "being processed", never "transferred". Settlement is
 * asynchronous: a `wallet_to_account` transfer HOLDS the amount and credits
 * nothing until the bridge confirms, so a client who reads "transferred" checks
 * their platform, finds nothing, and files a ticket about money that is exactly
 * where it should be.
 */
export function TransferSubmitted({ onAnother }: { onAnother: () => void }) {
  /*
   * No `MoneySheet` of its own: this is the CONTENT of the flow's third step,
   * and the page wraps it in the same card the first two steps used so the step
   * bar stays on screen. Rendering its own card here would drop that bar and
   * make the outcome look like a different screen the client was sent to.
   */
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <div>
          {/* `role="status"` so the outcome is announced, not just drawn. */}
          <h2 role="status" className="text-lg font-bold">
            {t('transfer.doneTitle')}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('transfer.doneBody')}
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button asChild size="sm">
            <Link href="/transactions">{t('deposit.trackIt')}</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onAnother}>
            {t('transfer.another')}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Where this transfer can land, given what it is leaving.
 *
 * Three shapes rather than one list, because the answer genuinely has three
 * shapes: nothing reachable, a choice of accounts, or the single wallet an
 * account's money must come back to.
 */
export function TransferDestinations({
  destinations,
  toAccount,
  currency,
  wallet,
  accountId,
  onSelect,
  disabled,
}: {
  destinations: TradingAccount[];
  toAccount: boolean;
  currency: string | undefined;
  wallet: Wallet | undefined;
  accountId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  if (destinations.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        {t('transfer.noDestination', { currency: currency ?? '' })}
      </p>
    );
  }

  if (toAccount) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {destinations.map((option) => (
          <MethodTile
            key={option.id}
            name="transfer-destination"
            value={option.id}
            checked={accountId === option.id}
            onChange={onSelect}
            title={t('transfer.accountLabel', {
              login: option.login ?? t('accounts.loginPending'),
            })}
            disabled={disabled}
            badge={
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {formatMoney(option.balance, option.currency)}
              </span>
            }
          />
        ))}
      </div>
    );
  }

  /*
   * Coming OUT of an account there is exactly one destination — the wallet in
   * that currency — so it is SHOWN rather than offered as a choice of one.
   *
   * The balance is "not opened yet" when no wallet exists: a currency the client
   * has never held is not a zero, and the transfer is still allowed because the
   * server owns that decision.
   */
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <WalletIcon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {t('transfer.walletLabel', { currency: currency ?? '' })}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {wallet ? formatMoney(wallet.available, wallet.currency) : t('transfer.walletUnopened')}
        </p>
      </div>
    </div>
  );
}
