'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';
import { direction } from '@/lib/i18n';

/**
 * The one toast host for the portal — mounted in the ROOT layout.
 *
 * ## Why the portal has one at all
 *
 * It deliberately did not. The convention recorded in `notifications-sheet.tsx`
 * was "plain async handlers with inline error state — no useMutation, no toast
 * (neither exists in this app)", and for FORM writes that stays true: a client
 * submitting a withdrawal is looking at the form, and an error belongs beside
 * the field that caused it, not in a corner.
 *
 * What changed is that the portal gained something no form can report — an
 * event that arrives while the client is looking at an unrelated screen. A
 * deposit settling, a withdrawal being approved, an identity check passing:
 * these come over the socket, at a moment the client did not choose. The bell
 * badge alone announces them only to somebody already looking at the bell.
 *
 * So this host exists for REAL-TIME NOTIFICATIONS specifically. Form mutations
 * keep their inline errors, and that split is the convention now: inline for
 * what the client just did, a toast for what happened to them.
 *
 * ## Why the ROOT layout
 *
 * The same reason the admin console's copy gives: `/login`, `/register` and the
 * verification screens sit outside the authenticated layout, and mounting the
 * host inside `portal-layout.tsx` would leave anything raised from those with
 * nowhere to render.
 *
 * ## Theme
 *
 * `resolvedTheme`, never `theme`: the default is `"system"`, and passing that
 * string through paints light toasts over a dark portal for every client who
 * never opened the theme menu.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      /*
       * BOTTOM right, unlike the admin console's top right.
       *
       * The portal's header carries the bell, and a toast landing under it
       * would cover the badge that the same event just incremented — hiding the
       * durable signal behind the transient one. It also keeps the toast clear
       * of the mobile header, which is where a client on a phone taps.
       */
      /*
       * The END corner and the page's direction: bottom-right in English,
       * bottom-left in Arabic, where the eye finishes a line. Sonner swaps the
       * close button and the swipe direction from `dir`.
       */
      dir={direction()}
      position={direction() === 'rtl' ? 'bottom-left' : 'bottom-right'}
      /*
       * Sonner's own distances (24px, 16px on phones), plus the room the
       * assistant's button takes in the same corner while it is shown
       * (`--assistant-room`, set by `AssistantProvider`; 0 everywhere else).
       */
      offset={{ bottom: 'calc(24px + var(--assistant-room, 0px))' }}
      mobileOffset={{ bottom: 'calc(16px + var(--assistant-room, 0px))' }}
      // Success green / error red without a per-call className. For a client
      // glancing over, the colour is read before the words.
      richColors
      closeButton
      /*
       * Longer than the console's 4s. An operator is watching the screen and a
       * toast is one of many that day; a client gets a handful ever, may be
       * mid-scroll when it lands, and the sentence ("your withdrawal of $X was
       * approved") is one they will want to finish reading.
       */
      duration={6000}
    />
  );
}
