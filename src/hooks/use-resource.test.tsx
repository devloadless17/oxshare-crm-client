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
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ rows: ['first'] })
      .mockRejectedValue(new Error('the endpoint is down'));

    const { result } = renderHook(() => useResource(['probe', 'bg'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual({ rows: ['first'] });

    const outcome = await act(async () => result.current.refetch());

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
    expect(result.current.status, 'a failed background refetch is INVISIBLE in status').toBe(
      'ready',
    );
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
    expect(result.current.status).toBe('ready');
    expect((result.current as unknown as Record<string, unknown>)['isStale']).toBeUndefined();
  });

  it('reports a SUCCESSFUL refresh as not-an-error, so the channel discriminates', async () => {
    /*
     * The control on the one channel that works. Without it, `refetch()` could
     * return `isError: true` unconditionally and the assertion above would still
     * pass — a signal that reports a problem nobody has.
     */
    const fetcher = vi.fn().mockResolvedValue({ rows: ['fine'] });

    const { result } = renderHook(() => useResource(['probe', 'clean'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const outcome = await act(async () => result.current.refetch());

    expect(outcome.isError).toBe(false);
  });

  it('still reports a FIRST load failure as error, which is the covered case', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('down from the start'));

    const { result } = renderHook(() => useResource(['probe', 'first'], () => fetcher()), {
      wrapper: wrap(),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
