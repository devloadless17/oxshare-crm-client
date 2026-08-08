import type { components } from './types.gen';
import { apiClient, idempotent } from './client';

/**
 * Declaring an incoming deposit — CORE-06.
 *
 * The flow is the one every broker runs regardless of which providers are
 * wired: the client says what they are sending and how, gets a reference, makes
 * the transfer quoting it, and an operator credits the wallet once the money
 * lands. No third-party credential is required for any of that, which is why
 * this endpoint exists while the automated provider webhooks do not.
 *
 * Types are ALIASES of the generated schemas — a backend rename is a compile
 * error here rather than a field that silently reads `undefined` on a screen.
 */

/** What the client filed. `reference` is the whole point of the response. */
export type DepositRequest = components['schemas']['DepositRequestDto'];

/**
 * A way to send money, as the OPERATOR configured it.
 *
 * This is what makes the deposit screen dynamic rather than a hardcoded list of
 * two. What arrives is what an operator enabled, in the order they chose: a key,
 * a name, a currency, a logo and the bounds the server will enforce.
 *
 * ## There is no `kind`, and the screen must not go looking for one
 *
 * It said `manual | gateway | crypto` and told the portal which deposit flow to
 * draw. The column was dropped in migration 0043, because it was a fact about
 * the backend's own integrations rather than about the method — and the screen
 * was printing it beside each option as "Manual" or "Instant", which is a
 * statement about our plumbing shown to somebody choosing how to pay.
 *
 * What decides the flow now is the ANSWER to `request()`: a `paymentUrl` means
 * pay here and now, its absence means quote this reference on a transfer. The
 * server knows by then, so the portal branches on the outcome rather than on a
 * prediction of it — and still never on `key`, which would need editing every
 * time a method is added.
 */
export type PaymentMethod = components['schemas']['PaymentMethodDto'];

export const depositsApi = {
  /**
   * The methods this client may actually use, in the operator's chosen order.
   *
   * The endpoint returns only what an operator ENABLED — and, for a method
   * backed by a payment gateway, only if this deployment holds that provider's
   * credentials. So every row here is one the client can genuinely send money
   * through. There is no client-side filtering to add and none to forget.
   */
  async listMethods(signal?: AbortSignal): Promise<PaymentMethod[]> {
    const { data } = await apiClient.get<PaymentMethod[]>('/payments/methods', { signal });
    return data;
  },

  /**
   * NOTHING IS CREDITED by this call. It files a `pending` deposit and returns
   * the reference to quote on the transfer; the wallet moves only when an
   * operator confirms the money arrived.
   *
   * `idempotencyKey` is REQUIRED, by the endpoint and by this signature, and it
   * is taken as a PARAMETER rather than minted here. The key names the user's
   * INTENT, not the HTTP call (R-5.2): one press of the button is one intended
   * deposit, so one key, reused for every attempt at it. A key generated inside
   * this function would be fresh on every call, so each retry would look like a
   * new declaration — which is exactly the bug the header exists to prevent,
   * and it is the version this file used to ship.
   *
   * `currency` is not a separate choice on the caller's side either: the METHOD
   * carries it. Letting a client pick USDT and then send it by bank transfer
   * would file a declaration the operator cannot reconcile against anything.
   */
  async request(
    input: {
      amount: string;
      currency: string;
      method: string;
      /**
       * Fund a live trading account instead of leaving the money in the wallet.
       *
       * The money still LANDS in the wallet either way — that is the CRM's
       * ledger — and the API chains a transfer onto the named account when the
       * operator confirms the payment. Omit for an ordinary wallet deposit.
       */
      destinationTradingAccountId?: string;
    },
    idempotencyKey: string,
  ): Promise<DepositRequest> {
    const { data } = await apiClient.post<DepositRequest>(
      '/payments/deposits',
      {
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        // Omitted rather than sent as null when the client is funding the
        // wallet: the field is optional on the API and an explicit null would
        // rely on the validator treating the two the same.
        ...(input.destinationTradingAccountId
          ? { destinationTradingAccountId: input.destinationTradingAccountId }
          : {}),
      },
      idempotent(idempotencyKey),
    );
    return data;
  },

  /**
   * "I have come back from the payment page — did it work?"
   *
   * For GATEWAY methods only. The server re-asks the provider over an
   * authenticated channel and settles the deposit if it has completed; nothing
   * the browser carries back is trusted, because a query string is something
   * the client can edit.
   *
   * Safe to call repeatedly, and it races the provider's own callback on
   * purpose — a callback can be delayed, lost, or blocked by a firewall, and a
   * client staring at a pending deposit they have just paid for is the worst
   * outcome this flow has. Whichever arrives first settles it; the other is a
   * no-op.
   */
  async settle(
    reference: string,
    method: string,
    signal?: AbortSignal,
  ): Promise<{ state: string }> {
    const { data } = await apiClient.get<{ state: string }>(
      `/payments/deposits/${encodeURIComponent(reference)}/status?method=${encodeURIComponent(method)}`,
      { signal },
    );
    return data;
  },
};
