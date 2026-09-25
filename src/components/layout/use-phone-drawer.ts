'use client';

import * as React from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';

/** The breakpoint at which the sidebar stops being a drawer (Tailwind's `lg`). */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * The phone drawer, as the modal it is — twin in behaviour of the console's
 * (`admin-layout.tsx`): focus moves into it, Tab cycles inside it, Escape
 * closes it and focus returns to the menu button that opened it.
 *
 * It used to be a panel slid off-screen and nothing more: Escape did nothing,
 * a keyboard user tabbed out of it into the page behind the overlay, and while
 * shut its links were still in the tab order (the layout now hides it too).
 */
export function usePhoneDrawer(panelRef: React.RefObject<HTMLElement | null>) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const show = React.useCallback(() => setOpen(true), []);

  useFocusTrap(panelRef, open, close);

  /*
   * A window widened past the breakpoint with the drawer open would keep the
   * trap on a sidebar that is no longer a drawer — Tab would cycle the menu
   * for ever. Crossing to desktop closes it. Only a CHANGE can get here: the
   * drawer opens from a button that exists below the breakpoint alone.
   */
  React.useEffect(() => {
    if (!open || typeof window.matchMedia !== 'function') return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, [open]);

  return { open, show, close };
}
