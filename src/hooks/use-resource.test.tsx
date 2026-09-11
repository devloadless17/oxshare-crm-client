import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { useResource } from './use-resource';

/**
 * WHAT A SCREEN IS TOLD WHEN A *BACKGROUND* REFETCH FAILS.
 *
 * The first load failing is well covered by every screen's error state. The case
 * nobody had asked about is the second one: the query already HAS data, a
 * refetch is triggered — by a mutation, an invalidation, a poll — and that
 * refetch fails.
 *
 * It matters because of what `useResource` does next. The status is derived as
 * `isPending` → `isError` → ready, and TanStack keeps a query with data in
 * `status: 'success'` when a background refetch fails: the failure lives in
 * `fetchStatus` and `errorUpdateCount`, not in `status`. So `isError` is false,
 * `AsyncBoundary` renders the ready branch, and **the screen shows stale rows
 * with no error anywhere** — which is exactly the symptom that took a day to
 * find on the profile's session list.
 *
 * Raised by crm-69 while reviewing that fix, explicitly as an UNVERIFIED claim
 * about framework behaviour. This file is the measurement, because "I reasoned
 * about it" is the error class this campaign exists to remove.
 */
function wrap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('a resource whose BACKGROUND refetch fails', () => {
  it('keeps serving the stale data — and says `ready`, not `error`', async () => {
    const fetcher = vi.fn<() => Promise<unknown>>();
    fetcher
      .mockResolvedValueOnce({ rows: ['first'] })
      .mockRejectedValue(new Error('the endpoint is down'));

    const { result } = renderHook(() => useResource(['probe', 'bg'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual({ rows: ['first'] });

    let outcome!: { isError: boolean };
    await act(async () => {
      outcome = await result.current.refetch();
    });

    /*
     * THE MEASUREMENT. Both assertions are the point:
     *
     * `status` staying 'ready' is what makes the failure invisible to
     * AsyncBoundary — every screen renders its happy path over data it has just
     * failed to refresh.
     *
     * `refetch()` reporting isError is what makes it RECOVERABLE: a caller that
     * looks can tell. That is why the return type is `{ isError }` rather than
     * `unknown`, and it is the only channel through which a caller can learn
     * this happened.
     */
    /*
     * ⚠️ `waitFor`, NOT a bare assertion, and the reason is the finding.
     *
     * The observer SNAPSHOT LAGS the query. Measured: immediately after the
     * failed refetch this reads `ready`; force one UNRELATED re-render and the
     * same query reads `error` with the data still present. So the old
     * behaviour was not "silently stale" — it was NON-DETERMINISTIC, and which
     * outcome a screen got depended on whether anything else happened to
     * re-render it: a sibling's state, a parent update, a modal opening.
     *
     * That is why this could never be reproduced consistently, and why a bare
     * assertion here passes for the wrong reason — it reads the lagging
     * snapshot rather than the settled answer.
     *
     * `refreshFailed` makes it deterministic: the data we hold keeps being
     * shown, and the failure is reported rather than blanking the screen.
     */
    await waitFor(() => {
      expect(result.current.status, 'held data keeps being shown, deterministically').toBe('ready');
      expect(result.current.refreshFailed, 'and the failure is REPORTED, not swallowed').toBe(true);
    });
    expect(result.current.data, 'and the stale rows are still on screen').toEqual({
      rows: ['first'],
    });
    expect(outcome.isError, 'but refetch() DOES report it — the one channel that works').toBe(true);

    /*
     * AND THERE IS NO STANDING SIGNAL ANYWHERE ELSE. This is the sharp half.
     *
     * An `isStale` flag was written for this and then REMOVED, because it could
     * not be implemented honestly: after a failed background refetch the
     * observer reports `errorUpdateCount: 0`, `failureCount: 0`,
     * `isRefetchError: false`, `isError: false`. Measured, not assumed.
     *
     * So a screen holding the resource cannot learn this happened by looking at
     * it. The ONLY channel is the value `refetch()` returns, which is why that
     * return type is `{ isError }` and not `unknown` — and why a caller that
     * fires it and forgets, or invalidates instead, has no way to know at all.
     */
  });

  it('reports a SUCCESSFUL refresh as not-an-error, so the channel discriminates', async () => {
    /*
     * The control on the one channel that works. Without it, `refetch()` could
     * return `isError: true` unconditionally and the assertion above would still
     * pass — a signal that reports a problem nobody has.
     */
    const fetcher = vi.fn<() => Promise<unknown>>();
    fetcher.mockResolvedValue({ rows: ['fine'] });

    const { result } = renderHook(() => useResource(['probe', 'clean'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    let outcome!: { isError: boolean };
    await act(async () => {
      outcome = await result.current.refetch();
    });

    expect(outcome.isError).toBe(false);
  });

  it('still reports a FIRST load failure as error, which is the covered case', async () => {
    const fetcher = vi.fn<() => Promise<unknown>>();
    fetcher.mockRejectedValue(new Error('down from the start'));

    const { result } = renderHook(() => useResource(['probe', 'first'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
