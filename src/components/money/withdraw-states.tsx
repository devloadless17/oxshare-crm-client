'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneySheet } from '@/components/money/money-shell';
import { t } from '@/lib/i18n';

/**
 * The states of /withdraw that have no form in them.
 *
 * Lifted out of the page because the page IS the three-step form, and these are
 * what it shows instead of one. Each fills the card rather than sitting at the
 * top of it, so the screen does not change height on the way in or out.
 */

/**
 * Nothing to withdraw FROM.
 *
 * Points at /deposit, because the only way out of this state is to put money in.
 * A withdrawal form with no funded wallet behind it would let a client fill in
 * an amount and be refused on submit for a reason the screen never showed.
 */
export function NoFundedWallets() {
  return (
    <MoneySheet className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('withdraw.noWallets')}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/deposit">{t('wallet.deposit')}</Link>
        </Button>
      </div>
    </MoneySheet>
  );
}

/**
 * No enabled payout rail, so no withdrawal is possible at all.
 *
 * Said plainly rather than shown as an empty method list: an empty list under a
 * working form reads as a loading failure, and the client would keep coming back
 * to a screen that was never going to work for them. There is deliberately no
 * action here — this one is the operator's to fix.
 */
export function NoWithdrawMethods() {
  return (
    <MoneySheet className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{t('withdraw.noMethods')}</p>
      </div>
    </MoneySheet>
  );
}

/**
 * The request is with the desk — which is not the same as paid.
 *
 * "Submitted" and "being reviewed", never "sent". The backend debits the wallet
 * on request and an operator releases the payout, so telling the client the
 * money has gone would be a different and wrong story about it.
 *
 * NO step rail above this. The three steps are the three questions a withdrawal
 * asks; the confirmation is not a fourth thing the client has to do, and marking
 * it as one would make a finished request look unfinished.
 */
export function WithdrawalSubmitted() {
  return (
    <MoneySheet className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        {/*
          `role="status"` so the outcome is announced: this replaces the form
          after an async submit, and a screen-reader user would otherwise be left
          on the button's last announcement.
        */}
        <div>
          <h2 role="status" className="text-lg font-bold">
            {t('withdraw.submittedTitle')}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('withdraw.submittedBody')}
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button asChild size="sm">
            <Link href="/transactions">{t('withdraw.viewTransactions')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/wallet">{t('deposit.backToWallet')}</Link>
          </Button>
        </div>
      </div>
    </MoneySheet>
  );
}
