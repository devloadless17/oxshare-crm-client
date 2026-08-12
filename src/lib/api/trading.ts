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
