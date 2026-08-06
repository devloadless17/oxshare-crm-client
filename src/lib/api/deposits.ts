import type { components } from './types.gen';
import { apiClient, idempotent, newIdempotencyKey } from './client';

/**
 * Declaring an incoming deposit — CORE-06.
 *
 * The deposit screen used to render `BackendPending` naming
 * `POST /payments/deposits` and a provider webhook, both blocked on Whish/USDT
 * credentials (§12.5). Only the AUTOMATED path was blocked: the flow every
 * broker runs regardless — client declares, quotes a reference, operator
 * reconciles against the bank statement — needs no third-party credential, and
 * that is what this calls.
 */

/** Aliased from the generated schema, so a backend rename is a compile error. */
export type DepositRequest = components['schemas']['DepositRequestDto'];

export type DepositMethod = 'bank_transfer' | 'usdt_trc20';

export const depositsApi = {
  /**
   * NOTHING IS CREDITED by this call. It files a `pending` deposit and returns
   * the reference to quote on the transfer; the wallet moves only when an
   * operator confirms the money arrived.
   *
   * The idempotency key is minted HERE rather than by the request interceptor,
   * and that is deliberate: a key belongs to the user's INTENT, not to the HTTP
   * call (R-5.2). One press of the button is one intended deposit, so one key —
   * which is what makes a double-click, a flaky network and a "did that go
   * through?" refresh all resolve to a single declaration instead of three
   * references for one incoming payment.
   */
  async request(
    amount: string,
    currency: string,
    method: DepositMethod,
    /**
     * Fund a live trading account instead of leaving the money in the wallet.
     *
     * The money still LANDS in the wallet either way — that is the CRM's ledger
     * — and the API chains a transfer onto the named account when the operator
     * confirms the payment. Omit for an ordinary wallet deposit.
     */
    destinationTradingAccountId?: string,
  ): Promise<DepositRequest> {
    const { data } = await apiClient.post<DepositRequest>(
      '/payments/deposits',
      {
        amount,
        currency,
        method,
        // Omitted rather than sent as null when the client is funding the
        // wallet: the field is optional on the API and an explicit null would
        // rely on the validator treating the two the same.
        ...(destinationTradingAccountId ? { destinationTradingAccountId } : {}),
      },
      idempotent(newIdempotencyKey()),
    );
    return data;
  },
};
