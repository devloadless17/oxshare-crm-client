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
import { WalletCard } from '@/components/wallet/wallet-card';
import { WalletCarousel, type CarouselEntry } from '@/components/wallet/wallet-carousel';
import { apiErrorMessage } from '@/lib/api/errors';
import { partnerApi } from '@/lib/api/partner';
import type { Wallet } from '@/lib/api/wallet';
import { compareMoney, formatMoney, isZeroMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

/**
 * A partner's earnings, as a CARD, and the one control that moves them.
 *
 * ## The same card component as /wallet, deliberately
 *
 * `WalletCard` is reused rather than restyled here. A commission balance IS a
 * wallet — same shape, same rules, same em-dash-not-zero behaviour — and drawing
 * it as a different kind of object would suggest it is a different kind of
 * money. What distinguishes it is the LABEL on the card face, which reads
 * "commission" where an ordinary card reads the currency's name.
 *
 * ## Why it is on /partner and nowhere else
 *
 * A commission wallet is deliberately absent from `GET /wallet`, so it cannot
 * appear on /wallet, /deposit or /withdraw — those screens read that endpoint
 * and none of them may offer a commission balance as a source. The exclusion is
 * server-side rather than a filter here, so a new money screen inherits the rule
 * without having to know it exists.
 *
 * What the partner does instead is move the money across, once, with the button
 * below. After that it is ordinary wallet money and every existing rail —
 * withdraw, transfer to a trading account — works on it unchanged.
 *
 * ## NO WALLET IS NOT A ZERO, again
 *
 * The rule /wallet turns on, and it applies here for the same reason. A partner
 * with no commission wallet has never been credited — the wallet is opened by
 * the first confirmed accrual — which is a different sentence from "you have
 * earned nothing and spent it". That state renders a flat placeholder at card
 * size with a sentence, never `$0.00`.
 *
 * A wallet that EXISTS and holds zero is a third state and reads differently
 * again: they have been paid and have already moved it. That one does show a
 * zero, because it is a true balance rather than a missing one.
 */
export function CommissionWallet({ wallets, holder }: { wallets: Wallet[]; holder?: string }) {
  /*
   * Largest first, so the balance most worth acting on leads the carousel.
   *
   * `compareMoney`, never `Number(a) - Number(b)` — that loses precision before
   * comparing — and never `localeCompare`, which sorts '9.00' above '100.00'.
   * A partner holding two currencies hits the second on the first mixed row.
   */
  const sorted = React.useMemo(
    () => [...wallets].sort((a, b) => compareMoney(b.available, a.available)),
    [wallets],
  );

  const byCurrency = React.useMemo(
    () => new Map(sorted.map((wallet) => [wallet.currency, wallet])),
    [sorted],
  );

  /*
   * The card face reads "COMMISSION" where an ordinary wallet card reads the
   * currency's NAME ("US Dollar"). That is the one thing a partner needs to know
   * at a glance about this card, and the currency code is already printed
   * beneath it in bold — so spending the label on the currency too would say the
   * same thing twice and leave the distinguishing fact unsaid.
   */
  const entries: CarouselEntry[] = sorted.map((wallet) => ({
    code: wallet.currency,
    label: t('partner.commissionCardLabel'),
  }));

  const only = sorted.length === 1 ? sorted[0] : undefined;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-link">
          <Coins className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-bold tracking-tight">{t('partner.commissionHeading')}</h2>
      </div>

      {sorted.length === 0 ? (
        <EmptyCommissionCard />
      ) : only ? (
        /* ONE wallet renders the card ALONE — no track, no arrows, no dots.
           The carousel hides its controls for a single entry anyway, but it
           still wraps the card in a scroll container with snap points, which is
           machinery around something that cannot move. */
        <div className="w-full max-w-md">
          <WalletCard
            label={t('partner.commissionCardLabel')}
            currency={only.currency}
            wallet={only}
            holder={holder}
          />
        </div>
      ) : (
        <WalletCarousel entries={entries} byCurrency={byCurrency} holder={holder} />
      )}

      {/*
        The action sits BENEATH the card, matching /wallet — on the card it would
        compete with the balance, which is the one thing the card exists to show.

        One button PER CURRENCY when there are several, rather than one button
        acting on "the card you can currently see". A carousel's visible slide is
        not something the reader can be certain of after a swipe lands
        mid-animation, and a money control must not be ambiguous about which
        balance it moves. Named buttons cost a line and remove the question.
      */}
      {sorted.length > 0 && (
        <div className="flex max-w-md flex-wrap gap-2">
          {sorted.map((wallet) => (
            <TransferAction key={wallet.id} wallet={wallet} named={sorted.length > 1} />
          ))}
        </div>
      )}

      <p className="flex max-w-md items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-link" aria-hidden="true" />
        <span>{t('partner.commissionNote')}</span>
      </p>
    </section>
  );
}

/**
 * The never-credited state, drawn at CARD SIZE.
 *
 * Same footprint as a real card so the column does not resize the moment a
 * partner is first paid, and flat and muted so it never reads as a funded card
 * at a glance — the same treatment `WalletCard` gives an unopened wallet, and
 * for the same reason.
 *
 * It says what has not happened yet and what will make it happen. It does NOT
 * say `$0.00`: there is no wallet, and a zero would claim a balance that had
 * been earned and spent.
 */
function EmptyCommissionCard() {
  return (
    <div className="flex aspect-[1.586] w-full max-w-md flex-col justify-center rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center sm:p-6">
      <Coins className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold">{t('partner.commissionEmpty')}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {t('partner.commissionEmptyBody')}
      </p>
    </div>
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

function TransferAction({ wallet, named }: { wallet: Wallet; named: boolean }) {
  const [open, setOpen] = React.useState(false);
  /*
   * The dialog's fields live HERE, not inside it, so they can be reset by the
   * handler that opens it.
   *
   * Resetting in an effect keyed on `open` is the obvious alternative and is a
   * lint error in this repo (`react-hooks/set-state-in-effect`) — rightly: it
   * sets state during commit to correct state that was never right, where the
   * open handler already knows the dialog is about to appear. Same shape as
   * `openRename` in components/accounts/account-actions.tsx.
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
    <>
      {/*
        Disabled on an empty wallet rather than hidden. The control disappearing
        is indistinguishable from the feature not existing, and a partner who
        moved their balance yesterday would come back to a card with nothing on
        it and no explanation.
      */}
      {/*
        The DEFAULT (filled) variant, unlike /wallet's three outline actions.
        That screen deliberately promotes none of them, because a client arriving
        at their wallet is as likely to be withdrawing as topping up. Here there
        is exactly one thing to do with this balance, and a filled button says so
        rather than leaving the reader to find it among equals.
      */}
      <Button
        type="button"
        size="sm"
        disabled={empty}
        onClick={openTransfer}
        className={named ? undefined : 'flex-1'}
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        {named
          ? t('partner.commissionTransferNamed', { currency: wallet.currency })
          : t('partner.commissionTransfer')}
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
    </>
  );
}

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
  /** Controlled by the action, which resets it when opening — see `openTransfer`. */
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
       *  - `ib-overview` holds this very balance AND the earnings total, which
       *    the transfer deliberately does not move.
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
              /* Scoped to the wallet: with one button per currency there are
                 several of these mounted at once, and a duplicated id would
                 point every label at the first input. */
              id={`commission-amount-${wallet.id}`}
              /* `inputMode` rather than `type="number"`: a number input hands
                 back a value the browser has already parsed and re-serialised,
                 which is a float round trip on a money field. The value stays a
                 STRING from here to the API (§6.1). */
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
                "Transfer all" sets the field to the RAW string the API sent, not
                a formatted one. `formatMoney` produces '$1,234.56' — with a
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
