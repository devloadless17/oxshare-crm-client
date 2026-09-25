'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * A tab held in the URL's `?tab=`, so it is linkable and survives a refresh.
 *
 * Linkable is the point: a "withdrawal approved" notification opens
 * `/withdraw?tab=history`, straight onto the row it is about. A tab in React
 * state would land them on the empty form instead.
 *
 * `replace`, not `push`: switching tabs is looking at the same screen another
 * way, and filling the Back history with tab flips means Back stops leaving.
 *
 * An unknown value reads as the default rather than as nothing selected — a
 * stale or hand-typed link still lands somewhere.
 *
 * Callers must sit under a `<Suspense>`: `useSearchParams` fails `next build`
 * outside one.
 */
export function useTabParam<T extends string>(
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('tab');
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;

  const setValue = React.useCallback(
    (next: T) => {
      const nextParams = new URLSearchParams(params.toString());
      if (next === fallback) nextParams.delete('tab');
      else nextParams.set('tab', next);
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, router, pathname, fallback],
  );

  return [value, setValue];
}
