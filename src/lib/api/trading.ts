import { apiClient } from './client';
import type { components } from './types.gen';

/**
 * The client's own trading accounts.
 *
 * Types are ALIASES of the generated schemas — never hand-written. See the note
 * in ./wallet.ts for the drift that rule has already caught in this folder.
 *
 * `balance` is a decimal STRING (§6.1) and stays one all the way to the DOM.
 * Render it through `formatMoney`; `Number()` and `parseFloat` are lint errors
 * on money paths.
 *
 * WHAT THIS ENDPOINT DOES NOT RETURN: equity, margin, free margin and open
 * positions. `balance` is the CRM-held figure a transfer actually credits, and
 * it stops moving the moment the client trades.
 *
 * Those figures are no longer unavailable — the MT5 bridge serves them, through
 * `getAccountSnapshot` and `getAccountPositions`. They are simply not on the
 * LIST, because each is a round trip to a server we do not own and the list
 * would multiply it by the number of accounts. Fetch them on a detail screen.
 */
export type TradingAccount = components['schemas']['TradingAccountDto'];

/** From the schema, so a new environment is a compile error rather than a gap. */
export type TradingEnvironment = TradingAccount['environment'];
export type TradingAccountStatus = TradingAccount['status'];

/**
 * One row of the CRM's own `positions` table.
 *
 * ## `GET /trading/positions` STILL returns an empty list for everyone
 *
 * Nothing writes to that table. The bridge landing did not change this: it
 * ingests CLOSED DEALS, and its position endpoint is a live read that is
 * deliberately not persisted.
 *
 * **For a client's open trades, use `getAccountPositions`** — live, per account,
 * with real floating P/L. This type is the stored shape and is what the
 * dashboard's positions panel renders, which is why that panel is still empty.
 *
 * The table is kept rather than dropped for the reason it was created: a screen
 * showing a hardcoded "nothing here" is indistinguishable from one whose query
 * genuinely found nothing, and this codebase has already told a client with
 * three live accounts that they had none.
 *
 * `profit` here is the REALISED result and is null while a position is open —
 * unlike `AccountPosition.profit`, which is the live floating figure. Do not
 * confuse the two: one is history, the other changes on every tick.
 */
export type Position = components['schemas']['PositionDto'];
export type PositionSide = Position['side'];
export type PositionStatus = Position['status'];

/**
 * What MT5 holds on ONE account, right now.
 *
 * ## This is the live figure and `TradingAccount.balance` is not
 *
 * The list endpoint's `balance` is the CRM's cached column — what a wallet
 * transfer credited. It is correct until the client's first trade and stale
 * afterwards, in the direction that matters: somebody who is down still sees
 * the number from before the trade.
 *
 * A screen showing both must LABEL which is which. Showing them as two
 * unlabelled money figures that disagree is worse than showing one.
 *
 * ## `floating` is the ACCOUNT total
 *
 * Equity minus balance minus credit — the unrealised result across every open
 * position, computed server-side from three numbers MT5 just sent. The
 * per-position breakdown comes from `getAccountPositions`, read independently
 * from the same server.
 *
 * The two can differ by a tick, and neither is derived from the other on
 * purpose. Recomputing one from the other would mean picking a winner and
 * hiding any real disagreement between two reads that are both true of slightly
 * different instants.
 *
 * `marginLevel` is null when the account has no margin requirement at all — no
 * open positions. Zero and "not applicable" are different answers and must not
 * render the same way.
 */
export type AccountSnapshot = components['schemas']['AccountSnapshotDto'];

/**
 * One OPEN position, live from MT5.
 *
 * `profit` is the FLOATING result and moves on every tick — it is read, never
 * stored, and the screen showing it must be refreshable rather than presented
 * as settled.
 *
 * `stopLoss` and `takeProfit` are null when unset: MT5 stores an absent stop as
 * the price 0, and `0.00` in a stop-loss column reads as an order to close at
 * zero. `commission` is null on the Manager protocol, which reports commission
 * on deals rather than on the position — not the same claim as `'0'`.
 */
export type AccountPosition = components['schemas']['AccountPositionDto'];

/**
 * One deal MT5 booked on an account — a trade leg, or a balance operation.
 *
 * `closing` is the field that matters for a CLOSED-TRADE view: it is true when
 * the deal REALISED a result rather than opening a position, which is the only
 * reliable way to tell the two apart. `entry` carries MT5's raw code (0 in,
 * 1 out, 2 inout, 3 out_by) and reading it directly means reimplementing that
 * mapping in the browser; the server already did it.
 */
export type AccountDeal = components['schemas']['AccountDealDto'];

/** Closed-trade totals plus the deals behind them, for one window. */
export type AccountHistory = components['schemas']['AccountHistoryDto'];

/**
 * What the server did with this screen's request to be pushed live figures.
 *
 * `watching: false` means keep polling — see `tradingApi.watchAccount`. The
 * `reason` is for a log, never for the client: "the trading server is full" is
 * not something they can act on, and their figures are arriving regardless.
 */
export type AccountWatch = components['schemas']['AccountWatchDto'];

/**
 * The landing page, in one response.
 *
 * One request rather than six because these panels are read in a single glance:
 * a balance from one instant beside a transaction list from another is a screen
 * that contradicts itself, and six requests give six ways to half-fail.
 */
export type Dashboard = components['schemas']['DashboardDto'];
export type DashboardStats = components['schemas']['DashboardStatsDto'];

/**
 * One account type the broker sells online.
 *
 * HAND-DECLARED, and marked as such: `GET /trading/accounts/self-service`
 * carries no `@ApiOkResponse`, so it generates no schema and there is nothing
 * to alias (API-CONTRACTS Part C). That means backend drift on this shape
 * reaches the portal as a runtime `undefined` rather than a compile error —
 * worth fixing with a DTO on the API side, and worth knowing until then.
 */
export interface AccountType {
  /** The MT5 group path. Sent back on create and validated server-side. */
  group: string;
  /** Read live from MT5. Empty when the server could not be asked. */
  currency: string;
  /**
   * The product this group belongs to, by name.
   *
   * What the open-account form actually asks about: the client chooses a
   * product and a currency, and the pair resolves to exactly one group —
   * `trading_product_groups` is unique on (product, environment, currency).
   */
  product: string;
  /**
   * The same product's name in Arabic, for display only — `product` stays the
   * value compared and resolved. Optional: an API without it (or an
   * untranslated product) shows `product`.
   */
  productAr?: string | null;
  /**
   * The product's id — sent back on create.
   *
   * One MT5 group may back several products since backend 0142, so the group
   * alone no longer says which product the client picked; the product decides
   * what the account's trades pay. Optional only so a response from an older
   * API still parses.
   */
  productId?: string;
}

/** What a client may open themselves, and on what terms. */
export interface SelfServiceAvailability {
  live: boolean;
  demo: boolean;
  liveTypes: AccountType[];
  demoTypes: AccountType[];
  /** The leverage ladder. A fixed list, not a free number — see the API. */
  leverages: number[];
  /*
   * The caps, so the page can stop offering a button the API would refuse.
   * Compared against the accounts it is already rendering — no extra request.
   */
  maxLiveAccounts: number;
  maxDemoAccounts: number;
  /**
   * The largest demo starting balance, as a decimal string.
   *
   * It arrives from the API rather than being a constant here. It WAS a
   * constant, duplicated between this app and the server, which meant the
   * figure the client was shown and the figure enforced could differ by a
   * deploy — and the client would find out by having their number silently
   * reduced.
   */
  maxDemoDeposit: string;
}

/**
 * A freshly opened account. NO PASSWORDS, deliberately.
 *
 * MT5 issues the master and investor passwords once and nothing stores them.
 * They are emailed to the client's registered address instead of being returned
 * here — this response is read by a browser, which is not necessarily one the
 * client controls. `credentialsSentTo` is echoed so the screen can say where
 * they went.
 */
export interface OpenedAccount {
  id: string;
  login: string;
  environment: TradingEnvironment;
  currency: string;
  leverage: number;
  /** What MT5 holds — the demo starting balance, or '0'. Read back, not assumed. */
  balance: string;
  credentialsSentTo: string;
}

/**
 * The outcome of a password reset. NO PASSWORDS, for the same reason
 * `OpenedAccount` carries none — and one more that is specific to a reset.
 *
 * Whoever is asking has, by definition, lost control of a credential. Handing
 * the replacement back to the browser that asked gives it to whoever is sitting
 * at that browser, which is sometimes precisely the party the reset exists to
 * shut out. The registered mailbox is the only channel already proven to belong
 * to the account holder, so `credentialsSentTo` is all that comes back.
 */
export interface PasswordResetResult {
  login: string;
  credentialsSentTo: string;
}

/**
 * What a demo top-up actually credited.
 *
 * `amount` is the CLAMPED figure, not what was asked for: the API caps a
 * request at the broker's ceiling rather than refusing it, so this is the only
 * honest number to report back. `balance` is MT5's own read after the credit,
 * or null when that read failed — the money still landed, and the sweep
 * reconciles the column shortly.
 */
export interface DemoFundingResult {
  id: string;
  login: string;
  amount: string;
  dealId: string;
  balance: string | null;
}

/** The name MT5 now holds for the account, echoed back after a rename. */
export interface RenameResult {
  login: string;
  name: string;
}

/** What the client gets to decide when opening an account. */
export interface OpenAccountInput {
  environment: TradingEnvironment;
  /** An MT5 group from the offered list. Omit to take the first. */
  group?: string;
  /** The chosen product's id, from the same offered type as `group` (0142). */
  productId?: string;
  /** One of the offered leverages. The API refuses anything else. */
  leverage?: number;
  /** A label. Omit for the client's own name, which is what MT5 expects. */
  name?: string;
  /**
   * DEMO ONLY. A decimal string, like every amount crossing this boundary.
   * The API REFUSES it on a live account rather than ignoring it, so sending
   * it there turns a valid request into an error.
   */
  startingBalance?: string;
}

export const tradingApi = {
  /**
   * Every account this client holds, live first then demo, newest first within
   * each.
   *
   * A bare array — unpaginated, because a client holds a handful of accounts
   * rather than a growing log. The server does the environment ordering so the
   * portal's grouping and the API cannot disagree about which is which.
   */
  /**
   * Whether this deployment lets a client open accounts themselves.
   *
   * Asked BEFORE drawing the buttons. The alternative — draw them and let the
   * API refuse — teaches a client that a feature is not for them by making them
   * press it, which is a poor way to find out.
   */
  async getSelfServiceAvailability(signal?: AbortSignal): Promise<SelfServiceAvailability> {
    const { data } = await apiClient.get<SelfServiceAvailability>(
      '/trading/accounts/self-service',
      { signal },
    );
    return data;
  },

  /**
   * Open a trading account.
   *
   * One field: the environment. The MT5 group, leverage and currency are the
   * broker's configuration rather than the client's choice — see
   * `SelfServiceGroups` on the API side.
   *
   * A live account requires a verified identity and is refused with the same
   * KYC error code the money endpoints use, so the existing verification prompt
   * applies unchanged.
   */
  async openAccount(input: OpenAccountInput): Promise<OpenedAccount> {
    const { data } = await apiClient.post<OpenedAccount>('/trading/accounts', input);
    return data;
  },

  async getAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts', { signal });
    return data;
  },

  /**
   * Reset BOTH passwords on a trading account.
   *
   * The new passwords are NOT in the response and never will be — they go to
   * the client's registered address, because the browser making this call is not
   * necessarily theirs. What comes back is WHERE they were sent, which is what
   * the screen should say instead of a bare "done".
   *
   * Not idempotent: every call invalidates the previous pair, so this must never
   * be retried automatically. The API throttles it to five an hour.
   */
  async resetAccountPassword(id: string): Promise<PasswordResetResult> {
    const { data } = await apiClient.post<PasswordResetResult>(`/trading/accounts/${id}/password`);
    return data;
  },

  /**
   * Rename a trading account.
   *
   * The name is the account HOLDER's as MT5 records it, so this changes what the
   * client sees in their own terminal. Nothing is stored portal-side.
   */
  async renameAccount(id: string, name: string): Promise<RenameResult> {
    const { data } = await apiClient.patch<RenameResult>(`/trading/accounts/${id}`, { name });
    return data;
  },

  /**
   * Add practice money to a DEMO account.
   *
   * A demo balance is consumed by practising, so an account traded down to
   * nothing is a practice account that can no longer be practised on. Before
   * this the only remedy was opening another one.
   *
   * The server refuses a live account — real money arrives by transfer, which
   * posts both sides of the movement — and CLAMPS an over-large amount to the
   * broker's ceiling rather than refusing it, so the returned `amount` is what
   * was actually credited and may be less than what was asked for. Show that
   * figure, not the one typed.
   */
  async fundDemoAccount(id: string, amount: string): Promise<DemoFundingResult> {
    const { data } = await apiClient.post<DemoFundingResult>(`/trading/accounts/${id}/fund`, {
      amount,
    });
    return data;
  },

  /**
   * One account the client owns.
   *
   * A 404 means "no such account of yours" and covers both a bad id and
   * somebody else's — the server does not distinguish them, so neither can this.
   * `useResource` maps 404 to `unavailable`, which the detail route renders as
   * not-found rather than as an unbuilt endpoint.
   */
  async getAccount(id: string, signal?: AbortSignal): Promise<TradingAccount> {
    const { data } = await apiClient.get<TradingAccount>(`/trading/accounts/${id}`, { signal });
    return data;
  },

  /**
   * Live balance, equity, margin and floating P/L, read from MT5.
   *
   * Returns null when the account has no MT5 login yet. That is NOT the same as
   * a failure: the request succeeded and the answer is "this account was never
   * provisioned on the trading server". An unreachable bridge throws instead,
   * and the two must not render as the same sentence — one is a permanent state
   * of this account, the other is temporary and about the platform.
   *
   * Called on the detail screen only. It crosses to a server we do not own, so
   * it is not on the list where it would multiply by the number of accounts.
   */
  async getAccountSnapshot(id: string, signal?: AbortSignal): Promise<AccountSnapshot | null> {
    const { data } = await apiClient.get<AccountSnapshot | null>(`/trading/accounts/${id}/live`, {
      signal,
    });
    return data;
  },

  /**
   * Every OPEN position on this account, live from MT5.
   *
   * An empty array means nothing is open — a real answer from the trading
   * server, not an unbuilt feature. Render it as "no open positions", never as
   * a gap.
   *
   * Every figure here moves on every tick, so a screen showing them needs a way
   * to re-read rather than presenting them as settled.
   */
  async getAccountPositions(id: string, signal?: AbortSignal): Promise<AccountPosition[]> {
    const { data } = await apiClient.get<AccountPosition[]>(`/trading/accounts/${id}/positions`, {
      signal,
    });
    return data;
  },

  /**
   * An account's CLOSED trades and their totals, for a date window.
   *
   * ## ⚠️ Nothing called this for a while, and that was the bug
   *
   * The portal's "Activity" card was removed and this reader went with it, so
   * the endpoint kept answering and no screen ever asked. A client could not see
   * a closed trade anywhere in the portal — which reads as "my history is empty"
   * rather than as a missing feature, because the open-positions table beside it
   * rendered perfectly and an account with nothing open looks the same either
   * way.
   *
   * ## A DATABASE read, unlike positions
   *
   * `mt5_deals` is our own table, populated by the bridge as it ingests deals.
   * So this survives MT5 being unreachable, needs no polling, and does not
   * compete for the bridge's single session lock — the opposite of
   * `getAccountPositions`, which must cross to MT5 because a floating P/L moves
   * on every tick.
   *
   * That is also why it can be paged over a window rather than read whole: a
   * closed trade never changes after the fact.
   *
   * ## The window, and the PAGE
   *
   * `from` and `to` are `YYYY-MM-DD` and INCLUSIVE at both ends. Omitted, the
   * server answers the last 30 days.
   *
   * `deals` is ONE PAGE of that window and `total` is how many closed trades it
   * has — which replaces the old 500-row cap a screen had to detect by
   * measuring the array. Ask for the page you are rendering; do not fetch every
   * page to count them, because `total` is the count.
   *
   * Only CLOSED trades are listed. Opening legs and balance operations are
   * filtered server-side now, so a screen no longer filters what it receives —
   * doing so would hide rows from a page and leave the pager pointing at
   * positions that render empty.
   *
   * ## `stats` describes the WINDOW, never the page
   *
   * That separation is the reason paging is safe here. The totals are
   * aggregated across every closed trade in the period, so they hold still
   * while a client pages through — summing the returned array instead would
   * make net profit and best trade change on every page turn.
   *
   * It is still a PERIOD, not a lifetime: a screen showing a win rate has to
   * say which window it describes.
   */
  async getAccountHistory(
    id: string,
    params: { from?: string; to?: string; page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<AccountHistory> {
    const { data } = await apiClient.get<AccountHistory>(`/trading/accounts/${id}/history`, {
      params,
      signal,
    });
    return data;
  },

  /**
   * Say this screen is OPEN, so the server pushes live figures to it.
   *
   * ## Why the screen has to keep saying so
   *
   * Nothing tells the trading server that a browser tab closed — a shut laptop
   * and a backgrounded phone both send exactly nothing — so this registers a
   * LEASE rather than a subscription. It expires unless it is renewed inside
   * `ttlSeconds`, which is what stops an abandoned page costing MT5 reads for
   * ever. `useLiveAccount` owns the heartbeat.
   *
   * ## `watching: false` is an ordinary answer
   *
   * Three reasons, and the screen's response to all of them is identical: keep
   * polling `/live` and `/positions` the way it always did. The account has no
   * MT5 login yet, or the bridge is already watching as many accounts as one
   * round can cover, or it cannot be reached. None is an error, none is worth
   * telling a client about, and the figures arrive either way — just less often.
   *
   * That is what makes this safe to call from a screen that already works: the
   * live path is an enhancement, never a dependency.
   */
  async watchAccount(id: string, signal?: AbortSignal): Promise<AccountWatch> {
    const { data } = await apiClient.post<AccountWatch>(
      `/trading/accounts/${id}/watch`,
      undefined,
      { signal },
    );
    return data;
  },

  /**
   * The accounts a wallet transfer may credit — live and active only.
   *
   * The server narrows this; it is not a filter the UI should re-implement.
   * `TransfersService` still refuses a bad destination, so this shapes what is
   * OFFERED rather than replacing the check.
   */
  async getTransferableAccounts(signal?: AbortSignal): Promise<TradingAccount[]> {
    const { data } = await apiClient.get<TradingAccount[]>('/trading/accounts/transferable', {
      signal,
    });
    return data;
  },

  /**
   * The client's positions — open by default.
   *
   * Empty for everyone until a bridge writes to the table. A caller must render
   * that as "no open positions" and NOT as a broken or unbuilt screen: the
   * request succeeded and the answer was zero rows.
   */
  async getPositions(
    options: { status?: PositionStatus; limit?: number; signal?: AbortSignal } = {},
  ): Promise<Position[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const { data } = await apiClient.get<Position[]>(
      query ? `/trading/positions?${query}` : '/trading/positions',
      { signal: options.signal },
    );
    return data;
  },
};

export const dashboardApi = {
  /** Everything the landing page renders, in one request. */
  async get(signal?: AbortSignal): Promise<Dashboard> {
    const { data } = await apiClient.get<Dashboard>('/dashboard', { signal });
    return data;
  },
};
