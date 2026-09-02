'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { useRealtime } from '@/hooks/use-realtime';
import { tradingApi, type AccountPosition, type AccountSnapshot } from '@/lib/api/trading';
import { keys } from '@/lib/query-keys';

/**
 * The account screen, fed by the server instead of asking every ten seconds.
 *
 * ## What this replaces, and why polling could not just be made faster
 *
 * The live panel and the positions table each polled their own route every ten
 * seconds. Every one of those requests crossed the bridge and took the single
 * MT5 session lock, so the cost scaled with VIEWERS × POLL RATE — which is why
 * both routes are capped at 12/min, and why the interval could not simply be
 * lowered to make the screen livelier. At the read latency this broker's Web API
 * actually delivers, a few dozen concurrent viewers already saturated it.
 *
 * Registering interest inverts that. The bridge reads the accounts somebody is
 * WATCHING on its own loop and pushes each reading out, so ten people on one
 * account cost one read rather than ten, and the answers arrive over the socket
 * this browser already holds for its notifications — no second connection, no
 * second handshake, exactly as `useRealtime` promises.
 *
 * ## The watch is a LEASE, so this heartbeats
 *
 * Nothing tells the server that a tab closed. A shut laptop and a backgrounded
 * phone both send precisely nothing, so a watch expires unless it is renewed —
 * that expiry is the only thing stopping an abandoned page costing MT5 reads for
 * ever. The interval comes from the server's own `ttlSeconds` rather than a
 * constant here, so the two cannot drift apart across a deploy.
 *
 * ## POLLING NEVER GOES AWAY, it only slows down
 *
 * This hook does not turn the polls off; it reports whether pushing is working
 * so the caller can lengthen them. That distinction is the whole safety of the
 * feature. Five things can leave the push path silent — the socket is down, the
 * bridge is unreachable, the bridge is at capacity, the account has no MT5 login
 * yet, or the API predates this endpoint — and in every one of them the screen
 * keeps working exactly as it did before, because the fallback is the behaviour
 * it is falling back FROM.
 *
 * ## Why the pushed figures go into the query cache
 *
 * `AccountLivePanel` and `AccountPositions` render from `useResource`, including
 * their loading, error and read-time states. Writing the pushed reading into the
 * same cache entries means both panels get it with no new prop, no second source
 * of truth, and — the part that matters — `dataUpdatedAt` moves, so the "read at"
 * line under the figures tells the truth about the pushed value too.
 *
 * This is NOT the `setQueryData` the money rules ban. That prohibition is on
 * COMPUTING a balance client-side — `balance - amount` — and this computes
 * nothing: it writes a server-authored snapshot, the same shape the same
 * endpoint would have returned, straight into the slot that endpoint fills.
 */

/** Falls back to this when the server does not say. Shorter than any real TTL. */
const DEFAULT_HEARTBEAT_MS = 15_000;

/**
 * How much of the lease to spend before renewing.
 *
 * Two-thirds, so an ordinary renewal has a whole spare beat before the lease
 * lapses. Renewing at the very end of it would drop the screen back to polling
 * every time a request was slow, and climbing back out of that costs a round.
 */
const HEARTBEAT_FRACTION = 2 / 3;

/**
 * How long after the last pushed reading the screen stops believing in the feed.
 *
 * A watch can be accepted and then go quiet — the bridge loses its MT5 session,
 * the round grows past this account, the CRM cannot reach Postgres. `watching`
 * would still be true and the screen would sit on a slow fallback poll waiting
 * for a push that is not coming.
 *
 * So "live" means A READING ARRIVED RECENTLY, not "the server said yes". Thirty
 * seconds is comfortably past a saturated round at the capacity the bridge is
 * configured for, and well inside the point where a client would notice.
 */
const SILENCE_MS = 30_000;

export interface LiveAccount {
  /**
   * Whether pushed readings are ARRIVING — not merely whether the server agreed
   * to send them. The caller uses this to pick a poll interval, so it has to
   * describe the feed rather than the promise; see `SILENCE_MS`.
   */
  live: boolean;

  /**
   * Whether those readings are arriving WITH POSITIONS, which is a separate
   * question and must not be folded into the one above.
   *
   * The server drops the positions array when an event will not fit
   * `pg_notify`'s 8000 bytes, so a client with many open trades gets live
   * account figures and NO pushed table. Reporting one flag for both told the
   * positions table it was being fed when it was not, and it slowed its own
   * fallback poll from ten seconds to sixty on the strength of it — leaving the
   * client who needs that table most with the stalest copy of it, which is
   * worse than before any of this existed.
   */
  positionsLive: boolean;
}

/**
 * The shape the socket delivers. Structurally the snapshot DTO plus positions,
 * minus the fields the server strips on the way out.
 *
 * Validated field by field before anything is written to the cache, because this
 * is a network boundary and `useRealtime` hands over `Record<string, unknown>`
 * by design — a payload that is merely SHAPED wrong would otherwise reach a
 * money formatter as `undefined` and render an em dash where a balance belongs.
 */
export interface LivePush {
  accountId: string;
  currency: string;
  balance: string;
  equity: string;
  credit: string;
  margin: string;
  marginFree: string;
  marginLevel: string | null;
  readAt: string;
  positions?: AccountPosition[];
}

export function useLiveAccount(accountId: string, enabled = true): LiveAccount {
  const queryClient = useQueryClient();

  const [lastPushAt, setLastPushAt] = React.useState<number | null>(null);
  /*
   * Tracked separately from `lastPushAt` rather than derived from it, because a
   * reading can legitimately arrive WITHOUT positions — see `positionsLive`.
   */
  const [lastPositionsAt, setLastPositionsAt] = React.useState<number | null>(null);

  /*
   * ── THE HEARTBEAT ────────────────────────────────────────────────────────
   *
   * Registers on mount and renews on a fraction of the server's lease. The
   * first call is immediate rather than on the first interval: the screen is
   * open NOW, and waiting a beat to say so would leave the client polling
   * through the very first seconds they are looking at their money.
   */
  React.useEffect(() => {
    if (!enabled || !accountId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      try {
        const result = await tradingApi.watchAccount(accountId);
        if (cancelled) return;

        /*
         * Rescheduled from the answer we just got rather than on a fixed
         * interval, so a server that shortens its lease is followed rather than
         * outrun. A refusal still reschedules: the bridge may be at capacity
         * now and free in a minute, and a screen that stopped asking would stay
         * on the slow path for as long as it was open.
         */
        const ttlMs = (result.ttlSeconds ?? 0) * 1000;
        const next = ttlMs > 0 ? ttlMs * HEARTBEAT_FRACTION : DEFAULT_HEARTBEAT_MS;
        timer = setTimeout(() => void beat(), next);
      } catch {
        /*
         * Swallowed, and deliberately not surfaced. Nobody asked for this —
         * the screen volunteered that it was open — and the figures are
         * loading fine through the polls. An error toast here would report a
         * failure the client cannot act on and does not have.
         */
        if (cancelled) return;
        timer = setTimeout(() => void beat(), DEFAULT_HEARTBEAT_MS);
      }
    };

    void beat();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      /*
       * No unwatch call on the way out. The lease expires on its own within
       * `ttlSeconds`, and a fire-and-forget request from a cleanup function
       * that runs during navigation is exactly the kind that gets cancelled
       * mid-flight anyway. The expiry is the mechanism; anything else would be
       * an optimisation that has to be correct during unmount.
       */
    };
  }, [accountId, enabled]);

  /*
   * ── THE FEED ─────────────────────────────────────────────────────────────
   *
   * One event name on the shared socket, exactly as `useRealtime` is built for.
   * The handler is rebuilt when the account changes; the hook keeps handlers in
   * a ref, so this does not resubscribe on every render.
   */
  const onLive = React.useCallback(
    (payload: Record<string, unknown> | undefined) => {
      const push = parseLivePush(payload);

      // Not ours. One socket carries every account this client holds, and a
      // dashboard watching three would otherwise write all three into one slot.
      if (!push || push.accountId !== accountId) return;

      const readAt = Date.parse(push.readAt);
      setLastPushAt(Number.isNaN(readAt) ? Date.now() : readAt);

      /*
       * MERGED over what the HTTP read already put there, never rebuilt.
       *
       * `login`, `group` and `leverage` are on the snapshot DTO and are NOT on
       * the wire here, because they do not move tick to tick — sending an
       * account's group several times a second to say its equity changed is
       * bytes spent on a fact that has not. They came with the first read and
       * stay.
       *
       * NO PREVIOUS VALUE MEANS NO WRITE. A push can beat the first HTTP read
       * home, and there is no honest snapshot to build from this payload alone:
       * inventing an empty login to satisfy the type would put a blank where an
       * MT5 account number belongs. Returning `undefined` leaves the cache
       * untouched, the in-flight read fills it a moment later, and the next
       * push — seconds away — merges onto that.
       */
      queryClient.setQueryData<AccountSnapshot>(
        keys.mt5Live.snapshot(accountId),
        (previous) =>
          previous && {
            ...previous,
            currency: push.currency,
            balance: push.balance,
            equity: push.equity,
            credit: push.credit,
            margin: push.margin,
            marginFree: push.marginFree,
            marginLevel: push.marginLevel,
            /*
             * `floating` is the one figure here not read straight from MT5.
             *
             * The REST route derives it server-side as equity − balance −
             * credit and the socket deliberately does not carry it, so this
             * repeats that subtraction rather than inventing anything: all
             * three operands are MT5's own figures from ONE read, and the
             * result is the definition the API documents.
             *
             * Through decimal.js, never through a float. These are decimal
             * strings off a NUMERIC(28,8) column and `Number(equity) -
             * Number(balance)` is wrong in the eighth decimal on ordinary
             * balances — on a screen whose whole purpose is agreeing with the
             * client's own terminal.
             */
            floating: floatingFrom(push),
          },
        /*
         * Stamped with the READ time, not `Date.now()`.
         *
         * The panel renders `dataUpdatedAt` as "read at", so stamping arrival
         * would claim a figure is fresher than it is — by the whole width of
         * the delivery path, which is exactly the gap that line exists to show.
         */
        { updatedAt: Number.isNaN(readAt) ? Date.now() : readAt },
      );

      /*
       * ABSENT positions leave the table alone; an EMPTY array clears it.
       *
       * The two are different answers and conflating them is the failure this
       * whole screen is built against. The server drops the array when the
       * payload will not fit the notification channel, so absence means "ask
       * separately" — writing `[]` there would tell a client holding three
       * trades that they hold none. An empty array from the server is a real
       * answer and must be written, or a client who just closed their last
       * position would keep seeing it.
       */
      if (push.positions) {
        setLastPositionsAt(Number.isNaN(readAt) ? Date.now() : readAt);
        queryClient.setQueryData(keys.mt5Live.positions(accountId), push.positions, {
          updatedAt: Number.isNaN(readAt) ? Date.now() : readAt,
        });
      }
    },
    [accountId, queryClient],
  );

  const handlers = React.useMemo(() => ({ 'account.live': onLive }), [onLive]);

  useRealtime(handlers, enabled);

  /*
   * ── IS THE FEED ACTUALLY ALIVE ───────────────────────────────────────────
   *
   * Recomputed on a timer rather than only when a push lands, because the
   * interesting transition is the one where NOTHING arrives: a feed that goes
   * quiet produces no event to react to, so a value derived only from pushes
   * would stay `true` for ever after the last one.
   */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [enabled]);

  const fresh = (at: number | null) => at !== null && now - at < SILENCE_MS;

  return { live: fresh(lastPushAt), positionsLive: fresh(lastPositionsAt) };
}

/**
 * Narrow one socket payload, or reject it.
 *
 * Every money field is checked for being a STRING, which is the check that
 * matters: a payload carrying numbers instead of decimal strings would flow
 * into `formatMoney` and render a rounded figure that looks entirely ordinary.
 * Rejecting the whole reading is correct — the next one is seconds away, and
 * the polls are still running underneath.
 */
export function parseLivePush(payload: Record<string, unknown> | undefined): LivePush | null {
  if (!payload) return null;

  const text = (key: string): string | null => {
    const value = payload[key];
    return typeof value === 'string' ? value : null;
  };

  const accountId = text('accountId');
  const currency = text('currency');
  const balance = text('balance');
  const equity = text('equity');
  const credit = text('credit');
  const margin = text('margin');
  const marginFree = text('marginFree');
  const readAt = text('readAt');

  if (
    !accountId ||
    !currency ||
    balance === null ||
    equity === null ||
    credit === null ||
    margin === null ||
    marginFree === null ||
    !readAt
  ) {
    return null;
  }

  return {
    accountId,
    currency,
    balance,
    equity,
    credit,
    margin,
    marginFree,
    // NULL and absent both mean "no margin requirement", which the panel renders
    // as an em dash. A literal 0 there would read as a margin call.
    marginLevel: text('marginLevel'),
    readAt,
    positions: parsePositions(payload.positions),
  };
}

/**
 * Narrow the position rows, or drop the whole array.
 *
 * ## Why this is not a cast
 *
 * It was one, and that was inconsistent with the care taken over the account
 * figures three lines above: `profit` and `swap` reach `formatMoney` and
 * `moneySign` exactly as `equity` does, so a row carrying JSON numbers renders a
 * rounded P/L that looks entirely ordinary. Same boundary, same rule.
 *
 * ## ALL OR NOTHING, and that is deliberate
 *
 * One malformed row drops the array, which leaves the table on its polled copy
 * rather than showing a partial book. A client's open positions are a SET — a
 * table quietly missing the one row that failed to parse is a client who thinks
 * they closed something they still hold, which is far worse than a table that
 * is ten seconds old.
 *
 * `undefined` here therefore reads exactly like the server dropping the array:
 * "unchanged, ask separately". The fallback poll is what answers.
 */
function parsePositions(value: unknown): AccountPosition[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows: AccountPosition[] = [];

  for (const row of value) {
    if (typeof row !== 'object' || row === null) return undefined;

    const it = row as Record<string, unknown>;
    const str = (key: string): string | null => {
      const value = it[key];
      return typeof value === 'string' ? value : null;
    };
    const nullableStr = (key: string) =>
      it[key] === null || it[key] === undefined ? null : str(key);

    const ticket = str('ticket');
    const symbol = str('symbol');
    const side = str('side');
    const volume = str('volume');
    const priceOpen = str('priceOpen');
    const priceCurrent = str('priceCurrent');
    const profit = str('profit');
    const swap = str('swap');
    const openedAt = str('openedAt');

    /*
     * `side` is required, and its absence is what this check exists to catch.
     * The first version of the live payload carried MT5's numeric `action` and
     * no label, so every pushed row rendered a blank Side column — a silent
     * downgrade of the polled table, on the one screen where buy and sell are
     * the difference between two opposite positions.
     */
    if (
      !ticket ||
      !symbol ||
      !side ||
      volume === null ||
      priceOpen === null ||
      priceCurrent === null ||
      profit === null ||
      swap === null ||
      !openedAt ||
      typeof it['action'] !== 'number'
    ) {
      return undefined;
    }

    rows.push({
      ticket,
      symbol,
      action: it['action'],
      side,
      volume,
      priceOpen,
      priceCurrent,
      // Null when unset. MT5 stores an absent stop as the price 0, and `0.00`
      // in a stop-loss column reads as an order to close at zero.
      stopLoss: nullableStr('stopLoss'),
      takeProfit: nullableStr('takeProfit'),
      profit,
      swap,
      commission: nullableStr('commission'),
      comment: nullableStr('comment'),
      openedAt,
    });
  }

  return rows;
}

/**
 * Unrealised P/L across every open position: `equity - balance - credit`.
 *
 * The API's own definition of `floating`, repeated on this side because the
 * socket payload carries the three operands and not the result. decimal.js
 * rather than `Number` for the reason `account-stats.ts` reaches for it too:
 * these are decimal strings off a NUMERIC(28,8) column, and a float is already
 * inexact before the subtraction begins.
 *
 * Eight decimals out, matching what the server sends, so a pushed figure and a
 * polled one are the same string rather than two renderings of one number.
 *
 * An unparseable operand yields the previous behaviour of a missing figure —
 * `'0'` is a claim of no floating P/L, which on a screen showing open positions
 * is a lie. `formatMoney` renders the empty string as an em dash.
 */
export function floatingFrom(push: LivePush): string {
  try {
    return new Decimal(push.equity).minus(push.balance).minus(push.credit).toFixed(8);
  } catch {
    return '';
  }
}
