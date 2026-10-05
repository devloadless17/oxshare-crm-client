'use client';

import * as React from 'react';

/*
 * The assistant's shared state, in its own module: the provider writes it, the
 * triggers (sidebar entry, phone button) read it, and neither imports the other.
 */
export type AssistantAccess = 'hidden' | 'locked' | 'available';

export interface AssistantContextValue {
  access: AssistantAccess;
  open: boolean;
  /** An answer finished while the panel was closed. */
  unread: boolean;
  /** The client has never opened it. */
  isNew: boolean;
  /** Opens the panel, or the verification dialog for an unverified client. */
  activate: () => void;
  close: () => void;
  prefetch: () => void;
}

export const AssistantContext = React.createContext<AssistantContextValue>({
  access: 'hidden',
  open: false,
  unread: false,
  isNew: false,
  activate: () => undefined,
  close: () => undefined,
  prefetch: () => undefined,
});

export function useAssistant(): AssistantContextValue {
  return React.useContext(AssistantContext);
}
