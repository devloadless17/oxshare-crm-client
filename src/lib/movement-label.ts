import type { MessageKey } from '@/lib/i18n';

/**
 * What to CALL one row of a client's money history.
 *
 * ## Why this is a module and not three ternaries
 *
 * It was three: `/transactions`, `/wallet` and the dashboard each carried the
 * same nested branch on `kind` and `direction`. That held while there were two
 * kinds. Adding `commission_transfer` meant editing the same expression in
 * three files, and the failure mode of missing one is not a crash — it is a
 * partner reading "Deposit" against their own commission transfer on one screen
 * and "Commission transfer" on another, with no way to tell which is right.
 *
 * Returning a MESSAGE KEY rather than a resolved string, because `t()` at module
 * scope is evaluated once at import and keeps whatever language the tab loaded
 * in — the same rule `NAV_ITEMS` and the wallet page's currency list follow.
 * The caller calls `t()` at render.
 *
 * ## The rule this encodes
 *
 * The API states `direction` from the WALLET's side on every row, so a transfer
 * that brought money back from a trading account arrives as `deposit`. That is
 * true of what happened to the wallet and the wrong word to PRINT: a client
 * reading "Deposit" goes looking for a payment they never made. So the label
 * comes from `kind` first and `direction` second, never from `direction` alone —
 * and never from "the method is empty", which is also true of a manual admin
 * credit.
 */
export function movementLabelKey(movement: { kind?: string; direction: string }): MessageKey {
  const incoming = movement.direction === 'deposit';

  switch (movement.kind) {
    case 'transfer':
      return incoming ? 'transactions.transferIn' : 'transactions.transferOut';

    /*
     * A partner moving earnings into their spending wallet.
     *
     * Always incoming — the API emits this row from the MAIN wallet's side and
     * the commission wallet's matching debit is not a second row, because that
     * wallet never appears in `GET /wallet`. So there is no "commission transfer
     * out" to name, and inventing one would describe a movement the client
     * cannot see either end of.
     *
     * Distinct from `transfer` deliberately: one changes what is available to
     * TRADE and the other what is available to WITHDRAW. Sharing a label would
     * tell a partner their earnings went to a trading account.
     */
    case 'commission_transfer':
      return 'transactions.commissionTransfer';

    default:
      /*
       * `payment` AND anything this build has not heard of.
       *
       * `kind` is an open set — `commission_transfer` was added after the first
       * two shipped — so a movement kind added server-side reaches a portal that
       * has not been redeployed. Falling back to the direction names it as a
       * deposit or a withdrawal, which is the honest half of what is known,
       * rather than rendering an empty cell that reads as a broken screen.
       */
      return incoming ? 'transactions.deposit' : 'transactions.withdrawal';
  }
}
