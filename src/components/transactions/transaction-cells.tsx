'use client';

/*
 * The cells every money-history table renders the same way — the method a
 * movement went through, and its state. Moved out of the transactions page so
 * the Deposit, Withdraw and Transfer histories cannot word a row differently
 * from the full activity list.
 */
import { MANUAL_ADMIN_PROVIDER, type Transaction } from '@/lib/api/payments';
import { STATE } from '@/components/transactions/transaction-filters';
import { localized, t, type MessageKey } from '@/lib/i18n';

/**
 * Where a movement came from, in the client's words rather than the system's.
 *
 * Three cases, in the order they are decided:
 *
 *  1. `methodName` — the operator's own name for the rail ("Whish Money").
 *     Resolved server-side, so it is never a key and never translated: it is a
 *     brand, and the client saw exactly these words when they chose it.
 *
 *     It covers BOTH directions. A deposit's name comes from `payment_methods`
 *     and a withdrawal's from `withdrawal_payment_methods` — different columns
 *     into different tables — and the API coalesces them into this one field.
 *     The list query used to join only the deposit side, so every withdrawal
 *     arrived with a null name and this cell fell through to case 3: an em dash
 *     where "Whish Money" belonged, on the client's own statement.
 *  2. `manual_admin` — money the team placed by hand. The label is OURS and
 *     therefore translated, because it is a sentence rather than a name.
 *  3. Anything else — an em dash. That is now genuinely "no rail was involved"
 *     rather than "this is a withdrawal", and inventing a word ("Unknown",
 *     "Other") would put one where the honest answer is nothing. `provider` is
 *     deliberately NOT shown raw: `manual_bank_transfer` is an internal
 *     identifier, not something to put on a client's statement.
 */
export function MethodCell({
  tx,
  ends,
}: {
  tx: Transaction;
  /**
   * Both ends of a transfer by NAME (`useTransferEnds`) — "USD Wallet → Main ·
   * #7001". Optional: without it the generic route below still renders.
   */
  ends?: { from: string; to: string } | null;
}) {
  if (ends && (tx.kind === 'transfer' || tx.kind === 'commission_transfer')) {
    return <TransferRoute label={t('common.route', { from: ends.from, to: ends.to })} />;
  }

  /*
   * A transfer went through no payment method, and saying so is more useful
   * than an em dash: it names the other end of the movement — the client's own
   * trading account — which is the answer to "where did this come from" on the
   * one row type that has no provider.
   *
   * Checked BEFORE `methodName`, not after. The field is null on a transfer
   * today, and an em dash here would be indistinguishable from the manual-credit
   * case below.
   */
  /*
   * ── WHICH WAY THE MONEY WENT, NOT JUST WHAT IT TOUCHED ──────────────────
   *
   * This said "Trading account" for both directions, which names the other end
   * and leaves out the half a client actually reads the row for: did money
   * LEAVE my wallet or ARRIVE in it. Two rows an hour apart, one funding an
   * account and one pulling the money back, were word-for-word identical here.
   *
   * `direction` is already on the row and is wallet-side for every kind — the
   * union maps `account_to_wallet` to `deposit` and `wallet_to_account` to
   * `withdrawal` precisely so the whole list can be read from the wallet's
   * point of view. Nothing new is fetched; the field was simply not used.
   */
  if (tx.kind === 'transfer') {
    return (
      <TransferRoute
        label={
          tx.direction === 'deposit'
            ? t('transactions.transferFromAccount')
            : t('transactions.transferToAccount')
        }
      />
    );
  }

  /* The other end of a commission transfer is the partner's own commission
     wallet — and it only ever moves one way, into the main wallet, so it needs
     no direction the way a trading transfer does. */
  if (tx.kind === 'commission_transfer') {
    return <TransferRoute label={t('transactions.transferFromCommission')} />;
  }

  if (tx.methodName) return <span>{localized(tx.methodName, tx.methodNameAr)}</span>;

  if (tx.provider === MANUAL_ADMIN_PROVIDER) {
    // Both ways since 7 Oct 2026: the team can take money out by hand, too.
    return (
      <span className="text-muted-foreground italic">
        {tx.direction === 'withdrawal'
          ? t('transactions.manualDebit')
          : t('transactions.manualCredit')}
      </span>
    );
  }

  return (
    <span className="text-muted-foreground" aria-hidden="true">
      —
    </span>
  );
}

/**
 * The two ends of a movement that touched no payment provider.
 *
 * The label already carries its own arrow ("Wallet → Trading account"), so no
 * leading icon: a second arrow in front of it read as a bullet pointing at
 * nothing.
 */
export function TransferRoute({ label }: { label: string }) {
  return <span className="truncate whitespace-nowrap text-muted-foreground">{label}</span>;
}

export function StateBadge({ state, kind }: { state: string; kind?: string }) {
  /*
   * `state` is a plain `string` here even though `STATE` is keyed by the
   * generated enum, and the two disagreeing on purpose is the point.
   *
   * The MAP is typed so a state added to the schema fails the build rather than
   * quietly falling through — that is what caught `failure` sitting where the
   * enum says `failed`. The LOOKUP is widened because a deployed backend can
   * start returning a new state before this app is redeployed, and at runtime
   * that has to render something rather than throw on a client's history.
   *
   * So: unknown at compile time is an error, unknown at runtime is the raw
   * value below.
   */
  /*
   * A pending TRANSFER reads "Processing". Nobody reviews one — it is waiting on
   * the trading server — where a withdrawal genuinely is reviewed by an operator
   * and keeps the original wording.
   */
  const meta: { key: MessageKey; className: string } | undefined =
    state === 'pending' && kind === 'transfer'
      ? { key: 'transactions.stateProcessing', className: STATE.pending.className }
      : (STATE as Record<string, { key: MessageKey; className: string }>)[state];
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        meta?.className ?? 'border-border bg-muted text-muted-foreground'
      }`}
    >
      {/*
        An unrecognised state renders its raw value rather than nothing. A new
        state added server-side should look unfamiliar here, not invisible —
        blank cells are how a client concludes the screen is broken.
      */}
      {meta ? t(meta.key) : state}
    </span>
  );
}
