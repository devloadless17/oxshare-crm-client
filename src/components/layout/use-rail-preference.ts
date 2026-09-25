'use client';

import * as React from 'react';

/**
 * The collapsed rail is a PREFERENCE, and a preference that resets is one the
 * client has to keep re-stating — twin of the console's (`admin-layout.tsx`).
 * It reset on every page change until the pages shared one frame (see
 * `app/(portal)/layout.tsx`), and still reset on every reload and on the way
 * through `/kyc`, which draws its own. Per browser, in localStorage: a
 * convenience, not state anybody else needs.
 *
 * Every read and write is guarded — storage can be absent, full or refused (a
 * private window, blocked site data), and the sidebar must work regardless.
 * Read in the state initializer without a hydration risk: this frame never
 * renders on the server, where `RequireAuth` draws the session check instead.
 */
const RAIL_KEY = 'oxshare-portal-sidebar';

function readRailPreference(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(RAIL_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function writeRailPreference(collapsed: boolean): void {
  try {
    window.localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // Unwritable storage costs the preference, never the sidebar.
  }
}

/** `[collapsed, toggle]` — the rail's state, written through to the preference. */
export function useRailPreference(): [boolean, () => void] {
  const [collapsed, setCollapsed] = React.useState(readRailPreference);
  const toggle = () => {
    // Written here, never inside a state updater — React may call an updater
    // twice, and an updater is meant to compute, not to reach storage.
    const next = !collapsed;
    setCollapsed(next);
    writeRailPreference(next);
  };
  return [collapsed, toggle];
}
