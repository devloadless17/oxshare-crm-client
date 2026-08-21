import { describe, expect, it } from 'vitest';
import { movementLabelKey } from './movement-label';

/**
 * What one row of a client's money history is CALLED.
 *
 * Every wrong answer here renders perfectly — that is the whole reason the
 * module exists. Three screens share it, and the failure mode of getting it
 * wrong is not a crash: it is a partner reading "Deposit" against their own
 * commission transfer on one screen and "Commission transfer" on another, with
 * nothing on either screen to say which is right.
 */
describe('naming a money movement', () => {
  /*
   * THE RULE THE MODULE EXISTS FOR.
   *
   * The API states `direction` from the WALLET's side, so money coming BACK
   * from a trading account arrives as `deposit`. That is true of what happened
   * to the wallet and the wrong word to print — a client reading "Deposit" goes
   * looking for a payment they never made. So `kind` decides first.
   */
  it('calls an incoming transfer a transfer, not a deposit', () => {
    expect(movementLabelKey({ kind: 'transfer', direction: 'deposit' })).toBe(
      'transactions.transferIn',
    );
  });

  it('distinguishes the two directions of a transfer', () => {
    expect(movementLabelKey({ kind: 'transfer', direction: 'withdrawal' })).toBe(
      'transactions.transferOut',
    );
  });

  /*
   * A commission transfer must NOT share the plain transfer's label. One
   * changes what is available to TRADE and the other what is available to
   * WITHDRAW; sharing a label would tell a partner their earnings had gone to
   * a trading account.
   */
  it('keeps a commission transfer distinct from an ordinary transfer', () => {
    const commission = movementLabelKey({ kind: 'commission_transfer', direction: 'deposit' });
    const ordinary = movementLabelKey({ kind: 'transfer', direction: 'deposit' });

    expect(commission).toBe('transactions.commissionTransfer');
    expect(commission).not.toBe(ordinary);
  });

  /*
   * Always incoming: the row is emitted from the MAIN wallet's side and the
   * commission wallet's matching debit is not a second row, because that wallet
   * never appears in the client's wallet list. There is no "commission transfer
   * out" to name.
   */
  it('names a commission transfer the same way regardless of direction', () => {
    expect(movementLabelKey({ kind: 'commission_transfer', direction: 'withdrawal' })).toBe(
      'transactions.commissionTransfer',
    );
  });

  it('falls back to the direction for an ordinary payment', () => {
    expect(movementLabelKey({ kind: 'payment', direction: 'deposit' })).toBe(
      'transactions.deposit',
    );
    expect(movementLabelKey({ kind: 'payment', direction: 'withdrawal' })).toBe(
      'transactions.withdrawal',
    );
  });

  /*
   * ⚠️ `kind` is an OPEN SET. `commission_transfer` was added after the first
   * two shipped, so a kind added server-side reaches a portal that has not been
   * redeployed. It must degrade to the honest half of what is known — never to
   * an empty cell, which reads as a broken screen on the page where a client
   * checks their own money.
   */
  it('names a kind this build has never heard of, rather than rendering nothing', () => {
    const future = movementLabelKey({ kind: 'rebate_payout_2027', direction: 'deposit' });

    expect(future).toBe('transactions.deposit');
    expect(future).toBeTruthy();
  });

  it('copes with a row carrying no kind at all', () => {
    expect(movementLabelKey({ direction: 'withdrawal' })).toBe('transactions.withdrawal');
  });
});
