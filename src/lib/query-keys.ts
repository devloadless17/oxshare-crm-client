/**
 * THE query-key registry. Every `queryKey` and every `invalidateQueries` in
 * this app resolves through here, and lint refuses an inline array literal in
 * either position (see `eslint.config.mjs`).
 *
 * It exists because React Query's prefix matching fails SILENTLY: an
 * invalidate against a key no query uses matches nothing, resolves happily and
 * refetches nothing. No error, no warning, no test — the screen simply keeps
 * rendering the value it had. On a portal where the value is a BALANCE, that
 * is the same class of defect as the `$0.00` shown to a client holding $700,
 * arriving by a different door.
 *
 * The twin registry in `oxshare-crm-admin` records what it cost there. Here it
 * cost three:
 *
 *  1. `queryKeysFor` mapped `wallet.credited`, `rebate.credited` and
 *     `commission.confirmed` to NOTHING. Those are the three kinds that ARE
 *     wallet credits, so the client got the chime, the toast and the bell
 *     badge — and a wallet still showing the old balance underneath.
 *  2. Trading accounts were `['trading-accounts']` while the transfer and
 *     deposit pickers read `['transferable-accounts']`, which nothing ever
 *     invalidated: open an account, go to Transfer, and it is not in the list.
 *  3. `['kyc-status']` and `['kyc-config']` were separate roots, so no single
 *     invalidate could cover the onboarding state.
 *
 * ## The two rules
 *
 * **1. A summary shares a root with the thing it summarises**, so one
 * invalidate covers both.
 *
 * **2. One resource, one root.** Keys are internal cache addresses — never
 * persisted, never in a URL — so renaming them is safe and free.
 */

/** Read parameters, opaque here: the registry addresses caches, it does not
 *  interpret them. */
type Params = unknown;

export const keys = {
  /** The signed-in client. Focus-refetched, never socket-driven. */
  session: {
    me: () => ['session', 'me'] as const,
    /** `refreshToken` is a counter the profile bumps to force a re-read; it
     *  is undefined until the first bump. */
    sessions: (refreshToken: number | undefined) => ['session', 'list', refreshToken] as const,
  },

  kyc: {
    all: () => ['kyc'] as const,
    status: () => ['kyc', 'status'] as const,
    config: () => ['kyc', 'config'] as const,
  },

  wallets: {
    all: () => ['wallets'] as const,
  },

  transactions: {
    all: () => ['transactions'] as const,
    list: (query: Params) => ['transactions', 'list', query] as const,
    /** Wallet-to-trading-account movements — a different endpoint. */
    transfers: () => ['transactions', 'transfers'] as const,
  },

  dashboard: {
    all: () => ['dashboard'] as const,
  },

  tradingAccounts: {
    all: () => ['trading-accounts'] as const,
    /** The pickers on /transfer and /deposit. Under the same root as the list
     *  deliberately: opening an account used to refresh one and not the other,
     *  so a new account was missing from Transfer until a hard refresh. */
    transferable: () => ['trading-accounts', 'transferable'] as const,
    selfService: () => ['trading-accounts', 'self-service'] as const,
    detail: (id: string) => ['trading-accounts', 'detail', id] as const,
    /** The account's own deal history — a CRM-side paged read of `mt5_deals`,
     *  cheap, and correctly refreshed with the account. */
    history: (id: string, from: string, to: string) =>
      ['trading-accounts', 'detail', id, 'history', from, to] as const,
  },

  /**
   * LIVE MT5 reads, on a root of their OWN — deliberately not under
   * `tradingAccounts`.
   *
   * They look like a detail of the account and must not be invalidated like
   * one. Each call is throttled 12/min per CLIENT, takes the single MT5
   * session lock, and is the most expensive read this system makes; they sit
   * behind a refresh button for that reason. Nested under `trading-accounts`
   * they would be prefix-matched by every bulk `tradingAccounts.all()` — so
   * one "account opened" notification would fire a burst of them. The
   * separation is what makes that structurally impossible rather than a rule
   * somebody has to remember; `notification-kinds.test.ts` pins it.
   *
   * It is also the honest shape: the CRM's cached `balance` and MT5's live
   * figures are two different things, which is why the account screen labels
   * both rather than showing one number.
   */
  mt5Live: {
    snapshot: (id: string) => ['mt5-live', 'snapshot', id] as const,
    positions: (id: string) => ['mt5-live', 'positions', id] as const,
  },

  partner: {
    all: () => ['partner'] as const,
    status: () => ['partner', 'status'] as const,
    overview: () => ['partner', 'overview'] as const,
    commissions: () => ['partner', 'commissions'] as const,
    positions: () => ['partner', 'positions'] as const,
    walletTransfers: () => ['partner', 'wallet-transfers'] as const,
    agencies: () => ['partner', 'agencies'] as const,
  },

  paymentMethods: {
    deposit: () => ['payment-methods', 'deposit'] as const,
    withdrawal: () => ['payment-methods', 'withdrawal'] as const,
  },

  currencies: {
    all: () => ['currencies'] as const,
  },

  platforms: {
    all: () => ['platforms'] as const,
  },

  externalLinks: {
    all: () => ['external-links'] as const,
  },

  notifications: {
    all: () => ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
} as const;

type KeyFactory = (...args: never[]) => readonly unknown[];

/**
 * Every key this app can address, as a union of tuple types.
 *
 * This is what turns a dead key into a COMPILE error rather than a silent
 * no-op: `queryKeysFor` (notification-kinds.ts) is typed to return these.
 */
export type PortalQueryKey<T = typeof keys> = T extends KeyFactory
  ? ReturnType<T>
  : T extends object
    ? { [K in keyof T]: PortalQueryKey<T[K]> }[keyof T]
    : never;

/** The root segment of every registered key, for the coverage test. */
export const REGISTERED_ROOTS: readonly string[] = Object.values(keys).flatMap((group) =>
  Object.values(group as Record<string, KeyFactory>).map(
    // The ROOT never depends on the arguments, so a placeholder reads it off.
    (factory) => (factory as (...a: unknown[]) => readonly unknown[])('', '', '')[0] as string,
  ),
);
