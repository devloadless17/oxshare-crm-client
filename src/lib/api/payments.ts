import { apiClient, idempotent } from './client';
import type { components } from './types.gen';

/**
 * Deposits, withdrawals and the client's own transaction history.
 *
 * Types are ALIASES of the generated schemas — never hand-written (see the note
 * in ./wallet.ts for the drift this rule has already caught here). Every
 * monetary field is a `string` (ARCHITECTURE §6.1); never widen one to `number`,
 * and render through `formatMoney` in lib/money.ts.
 *
 * ── What exists, and what does not ─────────────────────────────────────────
 *
 * WITHDRAWAL and TRANSACTIONS are real: the backend serves
 * `POST /payments/withdrawals` and `GET /payments/transactions` today.
 *
 * DEPOSIT is not. `TransactionsService.creditDeposit()` exists and is correct,
 * but the only thing that would call it is a Whish or USDT provider webhook, and
 * those are blocked on credentials (ARCHITECTURE §12.5, DECISIONS D-05). There
 * is no HTTP route a client could reach, so there is no function for one here —
 * the deposit screen renders `BackendPending` naming the gap rather than
 * pretending. That is the house rule: a screen without a backend says so.
 */
export type Transaction = components['schemas']['TransactionDto'];
export type RequestWithdrawal = components['schemas']['RequestWithdrawalDto'];

export const paymentsApi = {
  /**
   * The signed-in client's own transactions, newest first.
   *
   * Scoped by the session on the server — there is no user parameter, and there
   * must never be one (R-4.4: the owner comes from the token, never from a
   * request field).
   */
  async getTransactions(signal?: AbortSignal): Promise<Transaction[]> {
    const { data } = await apiClient.get<Transaction[]>('/payments/transactions', { signal });
    return data;
  },

  /**
   * Request a withdrawal.
   *
   * The server re-derives every constraint from its own state — available
   * balance, KYC level, the configured minimum and maximum (R-5.1). This sends
   * an intent; it does not assert anything.
   *
   * `amount` is a decimal STRING and stays one all the way from the input field.
   *
   * `idempotencyKey` is REQUIRED, by the endpoint and by this signature. The
   * API rejects a request without one (R-5.2), and it names the user's INTENT
   * rather than the HTTP call — so the caller generates it once, when the user
   * starts a withdrawal, and passes the same value for every attempt at that
   * withdrawal. That is what makes a double-click, a flaky network and an
   * anxious refresh all resolve to a single withdrawal.
   *
   * Taking it as a parameter rather than minting one here is the whole point:
   * a key generated inside this function would be fresh on every call, so each
   * duplicate would look like a new operation — precisely the bug the header
   * exists to prevent.
   */
  async requestWithdrawal(body: RequestWithdrawal, idempotencyKey: string): Promise<Transaction> {
    const { data } = await apiClient.post<Transaction>(
      '/payments/withdrawals',
      body,
      idempotent(idempotencyKey),
    );
    return data;
  },
};
