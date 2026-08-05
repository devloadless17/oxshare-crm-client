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
/**
 * `forbidden` is a 403 and is NOT an error in the sense the retry card means.
 *
 * R-2.3: 401 means "no valid session", 403 means "session valid, not
 * permitted". Both used to land in `error`, which rendered "something went
 * wrong — try again" over a page the caller will never be allowed to see, and
 * invited a retry that cannot succeed.
 *
 * Kept distinct from `unavailable` (404 = the endpoint is not built yet), which
 * is a to-do for the API owner rather than a statement about this caller.
 */
export type ResourceStatus = 'loading' | 'ready' | 'unavailable' | 'forbidden' | 'error';

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
        : httpStatusOf(query.error) === 403
          ? 'forbidden'
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
