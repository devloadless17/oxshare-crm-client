import { describe, expect, it } from 'vitest';
import { floatingFrom, parseLivePush, type LivePush } from './use-live-account';

/**
 * The two pure decisions on the pushed-figures path.
 *
 * Here for the reason `money.test.ts` and `account-stats.test.ts` are: both have
 * a wrong answer that renders perfectly. A payload accepted with numbers instead
 * of decimal strings produces a balance rounded in the eighth decimal, and a
 * floating P/L computed through a float produces a figure that disagrees with
 * the client's own MT5 terminal by an amount too small to notice and too large
 * to be right.
 *
 * This is also a NETWORK boundary in a way the polled path is not. A REST
 * response passes through the generated types and axios; a socket event arrives
 * as whatever was on the wire, delivered into a handler where a throw is
 * unhandled and nothing on screen reports it.
 *
 * Mutation-checked when written: each guarantee was deliberately broken and the
 * named test failed on the right assertion.
 */

const VALID: Record<string, unknown> = {
  accountId: 'acct-1',
  currency: 'USD',
  balance: '1250.00000000',
  equity: '1237.60000000',
  credit: '0.00000000',
  margin: '33.00000000',
  marginFree: '1204.60000000',
  marginLevel: '3750.30',
  readAt: '2026-09-02T12:00:00.000Z',
};

describe('parseLivePush — what may reach a money formatter', () => {
  it('accepts a well-formed reading', () => {
    const push = parseLivePush(VALID);

    expect(push?.accountId).toBe('acct-1');
    expect(push?.balance).toBe('1250.00000000');
    expect(push?.marginLevel).toBe('3750.30');
  });

  /*
   * THE regression this file exists for.
   *
   * §6.1: money crosses the API as a decimal STRING. A server or a proxy that
   * sent JSON numbers instead would hand `formatMoney` a value it cannot format
   * and, worse, one already rounded before it arrived. Rejecting the whole
   * reading is the correct response — the polls underneath are still running
   * and the next push is seconds away.
   */
  it('rejects a reading whose money arrived as numbers', () => {
    expect(parseLivePush({ ...VALID, balance: 1250 })).toBeNull();
    expect(parseLivePush({ ...VALID, equity: 1237.6 })).toBeNull();
  });

  it('rejects a reading with a field missing entirely', () => {
    const { marginFree: _dropped, ...withoutMarginFree } = VALID;
    expect(parseLivePush(withoutMarginFree)).toBeNull();
  });

  it('rejects a payload that is not an object at all', () => {
    expect(parseLivePush(undefined)).toBeNull();
  });

  /*
   * `marginLevel` is the one nullable figure, and NULL is a real answer: no
   * margin requirement at all. It must survive as null rather than being
   * defaulted — the panel renders null as an em dash, and a literal 0 there
   * reads as a margin call.
   */
  it('keeps a null margin level rather than defaulting it', () => {
    expect(parseLivePush({ ...VALID, marginLevel: null })?.marginLevel).toBeNull();
    const { marginLevel: _absent, ...withoutMarginLevel } = VALID;
    expect(parseLivePush(withoutMarginLevel)?.marginLevel).toBeNull();
  });

  /*
   * ABSENT positions and an EMPTY array are different answers, and the whole
   * account screen is built against conflating them.
   *
   * The server DROPS the array when the event will not fit its notification
   * channel, so absence means "unchanged, ask separately". Parsing that into
   * `[]` would tell a client holding three trades that they hold none — the
   * same failure the accounts list once shipped.
   */
  it('distinguishes positions that were dropped from positions that are empty', () => {
    expect(parseLivePush(VALID)?.positions).toBeUndefined();
    expect(parseLivePush({ ...VALID, positions: [] })?.positions).toEqual([]);
  });
});

describe('floatingFrom — equity minus balance minus credit', () => {
  const push = (over: Partial<LivePush>): LivePush => ({
    ...(parseLivePush(VALID) as LivePush),
    ...over,
  });

  it('computes the API’s own definition of floating', () => {
    // 1237.60 − 1250.00 − 0.00 = −12.40, a client underwater.
    expect(floatingFrom(push({}))).toBe('-12.40000000');
  });

  it('subtracts credit, which is not the client’s money', () => {
    expect(
      floatingFrom(
        push({ equity: '1300.00000000', balance: '1250.00000000', credit: '50.00000000' }),
      ),
    ).toBe('0.00000000');
  });

  /*
   * The reason this goes through decimal.js rather than `Number`.
   *
   * These are NUMERIC(28,8) values. Through floats the subtraction below is
   * inexact before it begins, and the result differs from the server's own
   * `floating` on the same three operands — putting two figures for one fact on
   * a screen whose entire purpose is agreeing with the client's terminal.
   */
  it('is exact on eight-decimal values a float would lose', () => {
    expect(
      floatingFrom(push({ equity: '0.30000000', balance: '0.10000000', credit: '0.20000000' })),
    ).toBe('0.00000000');
  });

  it('is exact past the range a float holds', () => {
    expect(
      floatingFrom(
        push({
          equity: '12345678901234567.89000000',
          balance: '12345678901234567.88000000',
          credit: '0.00000000',
        }),
      ),
    ).toBe('0.01000000');
  });

  /*
   * An unparseable operand yields NO FIGURE, never '0'. Zero floating P/L is a
   * claim — "you are exactly break-even" — and making it on an account with
   * open positions is the plausible wrong number this screen exists to avoid.
   * `formatMoney` renders the empty string as an em dash.
   */
  it('yields no figure rather than zero when an operand is unreadable', () => {
    expect(floatingFrom(push({ equity: 'unavailable' }))).toBe('');
  });
});
