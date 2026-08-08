import { apiClient, idempotent } from './client';
import type { components } from './types.gen';

/**
 * Withdrawals, transfers and the client's own transaction history.
 *
 * Types are ALIASES of the generated schemas — never hand-written (see the note
 * in ./wallet.ts for the drift this rule has already caught here). Every
 * monetary field is a `string` (ARCHITECTURE §6.1); never widen one to `number`,
 * and render through `formatMoney` in lib/money.ts.
 *
 * Deposits live in ./deposits.ts, with the payment-method list they depend on.
 *
 * Every function below fronts a route the backend guards with
 * `KycVerifiedGuard`, so an unapproved client is refused with
 * `KYC_NOT_VERIFIED` no matter what the browser believes. `lib/kyc-access.ts`
 * is the client half of that rule; this module makes no check of its own,
 * deliberately — a second opinion about the same question is a second thing to
 * drift.
 */
export type Transaction = components['schemas']['TransactionDto'];
/** One page of history plus the count of everything that matched the filters. */
export type TransactionPage = components['schemas']['TransactionPageDto'];
/**
 * The filters, ordering and paging the SERVER applies.
 *
 * ## ⚠️ HAND-DECLARED, and this is the gap
 *
 * `ListTransactionsQueryDto` exists in the backend but does NOT appear in
 * `components['schemas']`: Swagger flattens a `@Query()` DTO into individual
 * `parameters` on the operation rather than emitting a named schema, so
 * openapi-typescript has nothing to generate. This is the case the repo rule
 * covers — hand-declare, and name the gap so it gets replaced rather than
 * forgotten.
 *
 * What that costs, stated because it is the exact failure aliasing exists to
 * prevent: a column named here that the API's `@IsIn` does not accept compiles
 * fine and fails at runtime as a 400, on a money screen. The two lists below
 * must be kept in step with `TRANSACTION_SORT_FIELDS` and the query DTO by hand.
 *
 * The value TYPES are still borrowed from the generated `TransactionDto`, so a
 * state or direction renamed in the schema is a compile error here even though
 * the envelope is not.
 */
export interface TransactionQuery {
  direction?: Transaction['direction'];
  state?: Transaction['state'];
  currency?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to?: string;
  sort?: 'createdAt' | 'amount' | 'direction' | 'currency' | 'state';
  order?: 'asc' | 'desc';
  page?: number;
  /** Capped at 100 by the API. */
  limit?: number;
}
export type RequestWithdrawal = components['schemas']['RequestWithdrawalDto'];
export type RequestWithdrawalOtp = components['schemas']['RequestWithdrawalOtpDto'];
export type WithdrawalOtpResponse = components['schemas']['WithdrawalOtpResponseDto'];
export type Transfer = components['schemas']['TransferDto'];
export type RequestTransfer = components['schemas']['RequestTransferDto'];

/** The payout rails, from the schema — so a new one is a compile error here. */
export type WithdrawalProvider = RequestWithdrawal['provider'];

export const paymentsApi = {
  /**
   * The signed-in client's own transactions — filtered, ordered and paged BY THE
   * SERVER.
   *
   * Scoped by the session — there is no user parameter, and there must never be
   * one (R-4.4: the owner comes from the token, never from a request field).
   *
   * ## ⚠️ Every argument here is a database predicate, not a hint
   *
   * This used to fetch a bare array and the screen narrowed it in the browser.
   * The endpoint capped that array at 100 rows, so a client with more history
   * than that filtered the newest hundred while the screen said it was filtering
   * everything. Passing the filters means the WHERE, the ORDER BY and the COUNT
   * all describe the same complete set.
   *
   * `total` is therefore the real number of matching rows, and the reason the
   * response is an envelope rather than an array: a bare array has nowhere to
   * put the one number that makes the count on screen true.
   *
   * Undefined values are DROPPED rather than sent empty — `state=` would reach
   * the API as an empty string and fail its `@IsIn`, so "no filter" has to be
   * the absence of the parameter.
   */
  async getTransactions(
    query: TransactionQuery = {},
    signal?: AbortSignal,
  ): Promise<TransactionPage> {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
    );
    const { data } = await apiClient.get<TransactionPage>('/payments/transactions', {
      params,
      signal,
    });
    return data;
  },

  /**
   * Sends the confirmation code for ONE specific withdrawal — FR-CORE-08.
   *
   * The payload is the withdrawal itself, and that is load-bearing rather than
   * convenient: the server binds the code to these exact fields, so a code
   * obtained here cannot authorise a withdrawal with a different amount or a
   * different destination. Sending anything less than the full intent would
   * quietly give up that guarantee.
   *
   * Answers with a message either way — including when the operator has the OTP
   * control switched off — so the caller's flow does not branch on whether the
   * control is on. `required` is the BOOLEAN to read; the message is prose and
   * will be translated.
   */
  async sendWithdrawalOtp(
    body: RequestWithdrawalOtp,
    signal?: AbortSignal,
  ): Promise<WithdrawalOtpResponse> {
    const { data } = await apiClient.post<WithdrawalOtpResponse>(
      '/payments/withdrawals/otp',
      body,
      {
        signal,
      },
    );
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

  /** The client's own wallet ⇄ trading-account movements, newest first. */
  async getTransfers(signal?: AbortSignal): Promise<Transfer[]> {
    const { data } = await apiClient.get<Transfer[]>('/payments/transfers', { signal });
    return data;
  },

  /**
   * Move money between the wallet and a live trading account.
   *
   * Settles asynchronously: the response is `pending` until the MT5 bridge
   * confirms. A `wallet_to_account` transfer HOLDS the amount meanwhile and an
   * `account_to_wallet` one credits nothing until it settles — so a screen must
   * not render either as done on the 201.
   *
   * Same idempotency contract as the withdrawal above, for the same reason.
   */
  async requestTransfer(body: RequestTransfer, idempotencyKey: string): Promise<Transfer> {
    const { data } = await apiClient.post<Transfer>(
      '/payments/transfers',
      body,
      idempotent(idempotencyKey),
    );
    return data;
  },
};
