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
 * two. `instructions` and `payTo` are the operator's own words and account
 * details, rendered verbatim — the portal has no business reformatting an IBAN,
 * and it certainly has none inventing one.
 *
 * Branch on `kind`, never on `key`: the schema says so, and a screen that
 * checks `key === 'whish'` needs editing every time a method is added.
 */
export type PaymentMethod = components['schemas']['PaymentMethodDto'];
export type PaymentMethodKind = PaymentMethod['kind'];

export const depositsApi = {
  /**
   * The methods this client may actually use, in the operator's chosen order.
   *
   * The endpoint only returns methods that are enabled AND have a `payTo`, so
   * every row here is one the client can genuinely send money to. There is no
   * client-side filtering to add and none to forget.
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
};
