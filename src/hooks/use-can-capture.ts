'use client';

import * as React from 'react';

/**
 * Does this device have a CAMERA the file input can open?
 *
 * ## Why the question is "is the pointer coarse" rather than "is it mobile"
 *
 * `capture="environment"` on a file input asks the browser for the camera. A
 * phone honours it; a laptop IGNORES it and opens the ordinary file picker —
 * silently. So a "Take photo" button beside "Choose file" on a desktop is two
 * buttons that do exactly the same thing, and the reader is left working out
 * which one is broken. That was reported on the deposit receipt field.
 *
 * `(pointer: coarse)` is the honest test: it asks whether the primary input is a
 * finger, which is true of the devices that have a usable camera and false of
 * the ones where the attribute does nothing. User-agent sniffing would answer a
 * different question and be wrong on tablets with keyboards either way.
 *
 * ## `useSyncExternalStore`, not state in an effect
 *
 * matchMedia IS an external store, and this is the one API that reads it without
 * a render where the answer is briefly wrong. The server snapshot is `false`, so
 * SSR and the first client paint agree on the desktop layout and a phone
 * upgrades on hydration — no flash of the wrong button set.
 */
const COARSE_POINTER = '(pointer: coarse)';

function subscribeToPointer(onChange: () => void): () => void {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useCanCapture(): boolean {
  return React.useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}
