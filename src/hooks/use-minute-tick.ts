'use client';

import * as React from 'react';

/**
 * A clock that ticks once a minute, for "3 minutes ago" labels that would
 * otherwise freeze at whatever they said when the row rendered.
 *
 * ONE interval however many rows subscribe: it starts with the first listener
 * and stops with the last, so an unmounted panel costs nothing. Portal-only —
 * `lib/relative-time.ts` is a twin file with the admin and stays pure.
 */
let minute = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    minute += 1;
    listeners.forEach((notify) => notify());
  }, 60_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => minute;

/** Re-renders the caller every 60 seconds while it is mounted. */
export function useMinuteTick(): number {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}
