'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Coins, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi } from '@/lib/api/partner';
import type { Wallet } from '@/lib/api/wallet';
import { compareMoney, formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * Where a partner's earnings sit, and the one control that moves them.
 *
 * ## Why this is on /partner and nowhere else
 *
 * A commission wallet is deliberately absent from `GET /wallet`, so it cannot
 * appear on /wallet, /deposit or /withdraw — those screens read that endpoint
 * and none of them may offer a commission balance as a source. The exclusion is
 * server-side rather than a filter here, so a new money screen inherits the rule
 * without having to know it exists.
 *
 * What the partner does instead is move the money across, once, with the button
 * below. After that it is ordinary wallet money and every existing rail —
 * withdraw, transfer to a trading account — works on it unchanged. That is the
 * whole trade: one extra step, in exchange for not teaching three money screens
 * to ask which wallet they are acting on.
 *
 * ## NO WALLET IS NOT A ZERO, again
 *
 * The rule /wallet turns on, and it applies here for the same reason. A partner
 * with no commission wallet has never been credited — the wallet is opened by
 * the first confirmed accrual — which is a different sentence from "you have
 * earned nothing and spent it". An empty list renders as a statement, never as
 * `$0.00`.
 *
 * A wallet that EXISTS and holds zero is a third state and reads differently
 * again: they have been paid and have already moved it. That one does show a
 * zero, because it is a true balance rather than a missing one.
 */
export function CommissionWallet({ wallets }: { wallets: Wallet[] }) {
  /*
   * Largest first, so the balance most worth acting on leads.
   *
   * `compareMoney`, never `Number(a) - Number(b)` — that loses precision before
   * comparing — and never `localeCompare`, which sorts '9.00' above '100.00'.
   * A partner holding two currencies hits the second on the first mixed row.
   */
  const sorted = React.useMemo(
    () => [...wallets].sort((a, b) => compareMoney(b.available, a.available)),
    [wallets],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-link">
            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-bold tracking-tight">{t('partner.commissionHeading')}</h2>
        </div>
      </div>

      {sorted.length === 0 ? (
        /*
         * The "never credited" state. It says what has not happened yet and what
         * will make it happen — not "you have $0.00", which claims a wallet that
         * does not exist and a history that has not occurred.
         */
        <div className="p-8 text-center">
          <p className="text-sm font-semibold">{t('partner.commissionEmpty')}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {t('partner.commissionEmptyBody')}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((wallet) => (
            <CommissionRow key={wallet.id} wallet={wallet} />
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 border-t border-border bg-muted/30 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden="true" />
        <span>{t('partner.commissionNote')}</span>
      </p>
    </section>
  );
}

function CommissionRow({ wallet }: { wallet: Wallet }) {
  const [open, setOpen] = React.useState(false);
  /*
   * The dialog's fields live HERE, not inside it, so they can be reset by the
   * handler that opens it.
   *
   * Resetting in an effect keyed on `open` is the obvious alternative and is a
   * lint error in this repo (`react-hooks/set-state-in-effect`) — rightly: it
   * sets state during render-commit to correct state that was never right,
   * where the open handler already knows the dialog is about to appear. Same
   * shape as `openRename` in components/accounts/account-actions.tsx.
   *
   * It has to be a reset rather than nothing at all: re-opening after a transfer
   * would otherwise show the amount just sent, one click from sending it again,
   * on a control whose whole job is moving money.
   */
  const [amount, setAmount] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const empty = isZeroMoney(wallet.available);

  const openTransfer = () => {
    setAmount('');
    setError(null);
    setOpen(true);
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {wallet.currency}
        </p>
        {/* `available`, not `balance` — the figure a partner reads as "what I
            have" is the one they can actually move. They are equal today (no
            path places a hold on a commission wallet) and reading the same
            field every other money screen reads is what keeps that true. */}
        <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
          {formatMoney(wallet.available, wallet.currency)}
        </p>
      </div>

      {/*
        Disabled on an empty wallet rather than hidden. The control disappearing
        is indistinguishable from the feature not existing, and a partner who
        moved their balance yesterday would come back to a card with nothing on
        it and no explanation.
      */}
      <Button type="button" variant="outline" size="sm" disabled={empty} onClick={openTransfer}>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        {t('partner.commissionTransfer')}
      </Button>

      {/* Kept MOUNTED while closed rather than rendered conditionally: the
          dialog animates on close, and unmounting it the instant `open` flips
          would cut that animation off mid-way. */}
      <TransferDialog
        wallet={wallet}
        open={open}
        onOpenChange={setOpen}
        amount={amount}
        onAmountChange={setAmount}
        error={error}
        onError={setError}
      />
    </li>
  );
}

/**
 * A well-formed decimal, checked WITHOUT parsing it to a number.
 *
 * `compareMoney` falls back to a TEXT comparison on anything decimal.js cannot
 * read, and comparing 'abc' against '50.00' that way is positive — so raw input
 * would show "more than your balance" for a typo, which names the wrong problem.
 * This decides whether the comparison is meaningful at all; anything failing it
 * goes to the API, whose refusal says what is actually wrong.
 *
 * `Number()` is not the alternative: it is lint-banned on money paths here, for
 * the reason money.ts records.
 */
const DECIMAL = /^\d+(\.\d+)?$/;

function TransferDialog({
  wallet,
  open,
  onOpenChange,
  amount,
  onAmountChange,
  error,
  onError,
}: {
  wallet: Wallet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Controlled by the row, which resets it when opening — see `openTransfer`. */
  amount: string;
  onAmountChange: (amount: string) => void;
  error: string | null;
  onError: (error: string | null) => void;
}) {
  const queryClient = useQueryClient();

  const transfer = useMutation({
    mutationFn: () =>
      partnerApi.transferCommission({ amount: amount.trim(), currency: wallet.currency }),
    onSuccess: () => {
      onError(null);
      onOpenChange(false);
      /*
       * Three keys, because three screens show what just changed and none of
       * them refetches on its own.
       *
       *  - `ib-overview` holds this very balance AND the earnings total beside
       *    it, which the transfer deliberately does not move.
       *  - `wallets` is the main balance the money landed in — a partner who
       *    goes straight to /withdraw must not be shown the pre-transfer figure.
       *  - `transactions` is where the movement now appears; it is a prefix
       *    match, so both the paged list and the wallet page's "recent six"
       *    (keyed with its own limit) are covered by the one call.
       */
      void queryClient.invalidateQueries({ queryKey: ['ib-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['wallets'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e: unknown) => onError(apiErrorMessage(e, t('partner.commissionTransferFailed'))),
  });

  const trimmed = amount.trim();
  /*
   * The submit gate is deliberately WEAK: non-empty, and not more than the
   * balance. It is not a second copy of the server's rules.
   *
   * `compareMoney` for the ceiling, so the comparison happens in decimal.js
   * rather than through a float — `parseFloat` is banned on money paths, and
   * "is 0.1 + 0.2 more than 0.3" is exactly the question that makes a client
   * unable to move their own last cent.
   *
   * Anything malformed is left to the API, whose message is the one shown. A
   * client-side validator that disagreed with the server would produce a button
   * that refuses for a reason the server would not have given.
   */
  const overBalance = DECIMAL.test(trimmed) && compareMoney(trimmed, wallet.available) > 0;
  const submittable = trimmed !== '' && !overBalance && !transfer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('partner.commissionTransferTitle')}</DialogTitle>
          <DialogDescription>
            {t('partner.commissionTransferBody', { currency: wallet.currency })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          // `void` because React types a submit handler as returning void and
          // `no-misused-promises` is an error in this repo.
          onSubmit={(e) => {
            e.preventDefault();
            if (submittable) transfer.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="commission-amount">
              {t('partner.commissionAmountLabel', { currency: wallet.currency })}
            </Label>
            <Input
              id="commission-amount"
              // `inputMode` rather than `type="number"`: a number input hands
              // back a value the browser has already parsed and re-serialised,
              // which is a float round trip on a money field. The value stays a
              // STRING from here to the API (§6.1).
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t('partner.commissionAvailable', {
                  amount: formatMoney(wallet.available, wallet.currency),
                })}
              </p>
              {/*
                "Transfer all" sets the field to the RAW string the API sent,
                not a formatted one. `formatMoney` produces '$1,234.56' — with a
                currency symbol and a thousands separator — which is not a number
                the API accepts, and pasting it back would refuse a partner their
                own full balance.
              */}
              <button
                type="button"
                onClick={() => onAmountChange(wallet.available)}
                className="focus-outline rounded text-xs font-semibold text-link hover:underline"
              >
                {t('partner.commissionTransferAll')}
              </button>
            </div>
          </div>

          {overBalance && (
            <p role="alert" className="text-xs text-destructive">
              {t('partner.commissionOverBalance')}
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={transfer.isPending}
            >
              {t('partner.commissionCancel')}
            </Button>
            <Button type="submit" disabled={!submittable}>
              {transfer.isPending
                ? t('partner.commissionTransferring')
                : t('partner.commissionTransferConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
