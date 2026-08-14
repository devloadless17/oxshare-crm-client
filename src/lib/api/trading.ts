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
 * WHAT THIS ENDPOINT DOES NOT RETURN, and why the screen must not invent it:
 * equity, margin, free margin and open positions. Those are computed from live
 * prices against open trades and nothing in the CRM holds them — there is no
 * MT5 bridge. `balance` is the CRM-held figure a transfer actually credits.
 */
export type TradingAccount = components['schemas']['TradingAccountDto'];

/** From the schema, so a new environment is a compile error rather than a gap. */
export type TradingEnvironment = TradingAccount['environment'];
export type TradingAccountStatus = TradingAccount['status'];

/**
 * One trade on a trading account.
 *
 * ## `GET /trading/positions` returns an empty list today
 *
 * Nothing writes to the `positions` table — there is no MT5 bridge, so no
 * ingestion path exists. The table and this endpoint exist ahead of the feed so
 * the portal renders against a REAL query returning zero rows.
 *
 * That is the whole point, and it is worth not undoing: a screen showing a
 * hardcoded "nothing here" is indistinguishable from one whose query genuinely
 * found nothing, and this codebase has already told a client with three live
 * accounts that they had none. "No open positions" must stay something the
 * database said.
 *
 * `profit` is the REALISED result and is null while a position is open.
 * Floating P/L is deliberately absent everywhere — it changes on every tick, so
 * a stored copy is stale the moment it is written.
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
 * ## `floating` is the only floating figure this system has
 *
 * Equity minus balance minus credit — the unrealised total across every open
 * position, computed server-side from three numbers MT5 just sent. There is no
 * PER-POSITION floating anywhere: the bridge ingests closed deals and account
 * snapshots, and no open-position feed exists to attribute the total across
 * trades. Do not add a positions table to this screen and divide it up.
 *
 * `marginLevel` is null when the account has no margin requirement at all — no
 * open positions. Zero and "not applicable" are different answers and must not
 * render the same way.
 */
export type AccountSnapshot = components['schemas']['AccountSnapshotDto'];

/**
 * One deal on an account — a trade, or money moving.
 *
 * These are CLOSED deals from MT5. `closing` marks the ones that realised a
 * result: an opening deal carries `profit: '0'` because nothing has been
 * realised yet, so a P/L column must not treat the two alike.
 *
 * `actionLabel` is a stable slug (`buy`, `balance`, `commission`) with unknown
 * MT5 codes rendered as `action <n>` rather than blanked. Render the unknown
 * one AS IS — a client can quote it to support, where a blank row beside an
 * amount is what generates the ticket.
 */
export type AccountDeal = components['schemas']['AccountDealDto'];
export type AccountDealPage = components['schemas']['AccountDealPageDto'];

/**
 * An account's realised performance.
 *
 * Closed round trips only, summed in Postgres on NUMERIC. Balance operations
 * are excluded — a deposit is not a winning trade.
 *
 * **`wins + losses` need not equal `trades`.** A trade closing at exactly zero
 * is neither, and that is ordinary rather than a rounding artefact. A win rate
 * divides by `trades`, and the two counts must not be presented as a complete
 * partition of the total.
 *
 * `bestTrade` and `worstTrade` are null with no trades, deliberately not zero:
 * `'0'` beside a currency symbol claims there was a trade that broke even.
 */
export type AccountStats = components['schemas']['AccountStatsDto'];

/** The filters on an account's deal history. Dates are `YYYY-MM-DD`, INCLUSIVE. */
export interface AccountDealsQuery {
  kind?: 'trades' | 'balance';
  symbol?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * The landing page, in one response.
 *
 * One request rather than six because these panels are read in a single glance:
 * a balance from one instant beside a transaction list from another is a screen
 * that contradicts itself, and six requests give six ways to half-fail.
 */
export type Dashboard = components['schemas']['DashboardDto'];
export type DashboardStats = components['schemas']['DashboardStatsDto'];

/** One account type the broker sells online. */
export interface AccountType {
  /** The MT5 group path. Sent back on create and validated server-side. */
  group: string;
  /** Read live from MT5. Empty when the server could not be asked. */
  currency: string;
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

/** What the client gets to decide when opening an account. */
export interface OpenAccountInput {
  environment: TradingEnvironment;
  /** An MT5 group from the offered list. Omit to take the first. */
  group?: string;
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
   * One account's deal history — trades, money movements, or both.
   *
   * Paged SERVER-side, unlike `/transactions`, which filters a whole array in
   * the browser. The difference is not a style choice: a deal history grows
   * without bound, so a client-side filter over one page would silently
   * under-report the client's own trading.
   */
  async getAccountDeals(
    id: string,
    query: AccountDealsQuery = {},
    signal?: AbortSignal,
  ): Promise<AccountDealPage> {
    const params = new URLSearchParams();
    if (query.kind) params.set('kind', query.kind);
    if (query.symbol) params.set('symbol', query.symbol);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));

    const qs = params.toString();
    const { data } = await apiClient.get<AccountDealPage>(
      qs ? `/trading/accounts/${id}/deals?${qs}` : `/trading/accounts/${id}/deals`,
      { signal },
    );
    return data;
  },

  /** One account's realised performance, summed server-side. */
  async getAccountStats(id: string, signal?: AbortSignal): Promise<AccountStats> {
    const { data } = await apiClient.get<AccountStats>(`/trading/accounts/${id}/stats`, { signal });
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
