'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during SSR and the hydration pass, true afterwards.
 *
 * The usual `useState(false)` + `useEffect(() => setMounted(true))` does the
 * same job by driving a second render pass from an effect, which React now
 * flags — a state update in an effect is indistinguishable from a cascading
 * render bug. This says what it actually is: a value that differs between
 * server and client.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
