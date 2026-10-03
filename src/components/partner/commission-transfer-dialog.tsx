'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { newIdempotencyKey } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi } from '@/lib/api/partner';
import type { Wallet } from '@/lib/api/wallet';
import { compareMoney } from '@/lib/money';
import { moneyText } from '@/lib/bidi';
import { t } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';

/**
 * Move one commission balance into the main wallet of the same currency.
 *
 * ## There is nothing to poll afterwards
 *
 * Both legs commit in one database transaction, so a 200 IS the money having
 * moved — unlike a wallet ⇄ trading-account transfer, which stays pending until
 * the trading server confirms it. The response carries both resulting balances,
 * read inside that same transaction.
 *
 * ## A well-formed decimal, checked WITHOUT parsing it to a number
 *
 * `compareMoney` falls back to a TEXT comparison on anything decimal.js cannot
 * read, and comparing 'abc' against '50.00' that way is positive — so raw input
 * would show "more than your balance" for a typo, which names the wrong problem.
 * This decides whether the comparison is meaningful at all; anything failing it
 * goes to the API, whose refusal says what is actually wrong.
 *
 * `Number()` is not the alternative: it is banned on money paths here, for the
 * reason `lib/money.ts` records.
 */
const DECIMAL = /^\d+(\.\d+)?$/;

export function CommissionTransferDialog({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: Wallet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  /*
   * The key for THIS attempt, minted once and held across retries.
   *
   * Both legs commit in one transaction, so a 200 is the money having moved —
   * which is exactly what makes a LOST 200 dangerous. The partner sees an
   * unchanged balance and a live button, and the obvious response is to press
   * it again. The same key makes the server resolve that second press to the
   * first transfer instead of performing a second one.
   *
   * `??=`, so a retry after a failure REUSES the key: the failure may well have
   * moved the money and lost the response, which is the case the key exists
   * for. It is cleared on success, where the next transfer is a new intent and
   * must get a new key. Same rule, and the same reasoning, as /withdraw.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const transfer = useMutation({
    mutationFn: () => {
      idempotencyKey.current ??= newIdempotencyKey();
      return partnerApi.transferCommission(
        { amount: amount.trim(), currency: wallet.currency },
        idempotencyKey.current,
      );
    },
    onSuccess: () => {
      setError(null);
      idempotencyKey.current = null;
      /*
       * Cleared on SUCCESS, not in an effect keyed on `open`.
       *
       * Resetting in an effect is a lint error in this repo
       * (`react-hooks/set-state-in-effect`) and rightly so: it sets state during
       * commit to correct state that was never right. It has to happen
       * somewhere, though — re-opening after a transfer would otherwise show the
       * amount just sent, one click from sending it again, on a control whose
       * whole job is moving money.
       */
      setAmount('');
      onOpenChange(false);
      /*
       * Four keys, because four screens show what just changed and none of them
       * refetches on its own.
       *
       *  - `ib-overview` holds this very balance AND the earnings total, which
       *    the transfer deliberately does not move.
       *  - `ib-wallet-transfers` is the list this move now belongs to.
       *  - `wallets` is the main balance the money landed in — a partner who
       *    goes straight to /withdraw must not see the pre-transfer figure.
       *  - `transactions` is where the movement appears; it is a prefix match,
       *    so both the paged list and the wallet page's "recent six" (keyed with
       *    its own limit) are covered by the one call.
       */
      void queryClient.invalidateQueries({ queryKey: keys.partner.overview() });
      void queryClient.invalidateQueries({ queryKey: keys.partner.walletTransfers() });
      void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
      void queryClient.invalidateQueries({ queryKey: keys.transactions.all() });
      // The dashboard carries `wallets` and `recentTransactions` in one
      // payload, so it went stale with the two above it.
      void queryClient.invalidateQueries({ queryKey: keys.dashboard.all() });
    },
    onError: (e: unknown) => setError(apiErrorMessage(e, t('partner.commissionTransferFailed'))),
  });

  const trimmed = amount.trim();
  /*
   * The submit gate is deliberately WEAK: non-empty, and not more than the
   * balance. It is not a second copy of the server's rules.
   *
   * `compareMoney` for the ceiling, so the comparison happens in decimal.js
   * rather than through a float — "is 0.1 + 0.2 more than 0.3" is exactly the
   * question that makes a partner unable to move their own last cent.
   *
   * Anything malformed is left to the API, whose message is the one shown. A
   * client-side validator that disagreed with the server would produce a button
   * that refuses for a reason the server would not have given.
   */
  const overBalance = DECIMAL.test(trimmed) && compareMoney(trimmed, wallet.available) > 0;
  const submittable = trimmed !== '' && !overBalance && !transfer.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        /*
         * Not while a transfer is in flight: closing then hid its outcome — the
         * refusal, or the success that clears the field — from the partner.
         */
        if (!next && transfer.isPending) return;
        /*
         * A refusal belongs to the attempt it answered. Kept, it greeted the
         * partner the next time they opened the dialog, before they had sent
         * anything. The amount and the idempotency key stay: a retry of the
         * identical transfer must still resolve to one transfer.
         */
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('partner.commissionTransferTitle')}</DialogTitle>
          <DialogDescription>
            {t('partner.commissionTransferBody', { currency: wallet.currency })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (submittable) transfer.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`commission-amount-${wallet.id}`}>
              {t('partner.commissionAmountLabel', { currency: wallet.currency })}
            </Label>
            <Input
              /* Scoped to the wallet: one of these is mounted per currency, and
                 a duplicated id would point every label at the first input. */
              id={`commission-amount-${wallet.id}`}
              /* `inputMode` rather than `type="number"`: a number input hands
                 back a value the browser has already parsed and re-serialised,
                 which is a float round trip on a money field. The value stays a
                 STRING from here to the API (§6.1). */
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t('partner.commissionAvailable', {
                  amount: moneyText(wallet.available, wallet.currency),
                })}
              </p>
              {/*
                "Transfer all" sets the field to the RAW string the API sent, not
                a formatted one. `formatMoney` produces '$1,234.56' — with a
                symbol and a thousands separator — which is not a number the API
                accepts, and pasting it back would refuse a partner their own
                full balance.
              */}
              <button
                type="button"
                onClick={() => setAmount(wallet.available)}
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
              onClick={() => {
                setError(null);
                onOpenChange(false);
              }}
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
