'use client';

import { useQuery, type QueryKey } from '@tanstack/react-query';

/**
 * TWIN FILE — an identical copy lives at the same path in oxshare-crm-admin.
 * Behaviour changes belong in both.
 *
 * Note the one deliberate difference from admin's copy: `apiErrorMessage` is not
 * re-exported here. This repo's canonical version lives in lib/api/errors.ts and
 * has an `error.message` fallback that admin's inline copy drops. Import it from
 * there.
 */

/**
 * The four states every data screen renders. `unavailable` is distinct from
 * `error` on purpose: a 404 means the backend endpoint is not built yet (a to-do
 * for the API owner) while an error means something broke.
 */
export type ResourceStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export interface Resource<T> {
  status: ResourceStatus;
  data: T | undefined;
  /** True while a background refetch runs and stale data is still on screen. */
  isFetching: boolean;
  error: unknown;
  /** Resolves once the refetch settles, so callers can await it. */
  refetch: () => Promise<unknown>;
}

/**
 * One fetch primitive for every data screen.
 *
 * The query function receives React Query's AbortSignal, so a superseded request
 * is cancelled rather than left to land out of order.
 */
export function useResource<T>(
  key: QueryKey,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { enabled?: boolean },
): Resource<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous, // keep the page visible while paging
  });

  const status: ResourceStatus = query.isPending
    ? 'loading'
    : query.isError
      ? httpStatusOf(query.error) === 404
        ? 'unavailable'
        : 'error'
      : 'ready';

  return {
    status,
    data: query.data,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => query.refetch(),
  };
}
