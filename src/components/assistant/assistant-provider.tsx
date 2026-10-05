'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { KycGateDialog } from '@/components/kyc/kyc-gate-dialog';
import { useUser } from '@/context/UserContext';
import { useKycAccess } from '@/hooks/use-kyc-access';
import { assistantApi } from '@/lib/api/assistant';
import { keys } from '@/lib/query-keys';
import {
  AssistantContext,
  type AssistantAccess,
  type AssistantContextValue,
} from './assistant-context';
import { AssistantLauncher } from './assistant-triggers';
import { useAssistantChat } from './use-assistant-chat';

/*
 * The panel, its Markdown renderer and the stream code load on first open
 * (prefetched when a trigger is hovered or focused), so the assistant adds a
 * few KB to pages where nobody uses it.
 */
const loadPanel = () => import('./assistant-panel');
const AssistantPanel = dynamic(loadPanel, { ssr: false });

/** Set once the client has opened the assistant; until then its entry says "New". */
const SEEN_KEY = 'oxshare-assistant-seen';

function subscribeSeen(notify: () => void): () => void {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * The portal assistant (backend 0187): ONE owner of its state, read by the one
 * launcher at the bottom-end corner (bottom-right in English, bottom-left in
 * Arabic) on every screen.
 *
 * Access comes from `GET /assistant/config`, asked only for a signed-in client:
 * - `available` opens the panel.
 * - `locked` (not verified) opens the same verification dialog the money
 *   buttons use, because the assistant is gated like deposits.
 * - `hidden` (switched off, or no model configured) draws nothing at all.
 */
export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const kyc = useKycAccess();
  const { data: config } = useQuery({
    queryKey: keys.assistant.config(),
    queryFn: ({ signal }) => assistantApi.config(signal),
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [unread, setUnread] = React.useState(false);
  const [gateOpen, setGateOpen] = React.useState(false);
  const seen = React.useSyncExternalStore(subscribeSeen, readSeen, () => true);
  const [seenNow, setSeenNow] = React.useState(false);
  const openRef = React.useRef(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onAnswerSettled = React.useCallback(() => {
    if (!openRef.current) setUnread(true);
  }, []);
  // The conversation lives HERE, so the click that opens the panel decides what it shows.
  const chat = useAssistantChat({ onAnswerSettled });
  // The two parts `activate` reads: depending on `chat` itself, a new object on
  // every streamed frame, re-rendered the launcher with each one.
  const { streaming, newChat } = chat;
  const [view, setView] = React.useState<'chat' | 'history'>('chat');

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const access: AssistantAccess = config?.available
    ? 'available'
    : config?.reason === 'kyc_required'
      ? 'locked'
      : 'hidden';

  const activate = React.useCallback(() => {
    if (access === 'locked') {
      setGateOpen(true);
      return;
    }
    if (access !== 'available') return;
    /*
     * Every open starts on the ask screen: greeting, suggestions, cursor in the
     * box. Never on the history list or an old thread (owner's report, 5 Oct
     * 2026). Two exceptions, both answers the client is waiting for: one still
     * being written, and one that finished while the panel was closed. The last
     * chat stays one tap away, on the ask screen.
     */
    if (!streaming && !unread) newChat();
    setView('chat');
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setMounted(true);
    setOpen(true);
    setUnread(false);
    setSeenNow(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blocked: the "New" badge returns next visit. Harmless.
    }
  }, [access, newChat, streaming, unread]);

  const close = React.useCallback(() => {
    setOpen(false);
    // Focus goes back to whichever trigger opened it, for keyboard users.
    const target = returnFocusRef.current;
    requestAnimationFrame(() => target?.focus());
  }, []);

  /*
   * While the button is shown, the page's last line and the toasts keep clear of
   * it: `--assistant-room` is its footprint (52-56px plus its margin from the
   * edge), read by the page frame and the toaster. Unset, both read 0.
   */
  React.useEffect(() => {
    if (access === 'hidden') return;
    const root = document.documentElement.style;
    root.setProperty('--assistant-room', '4.5rem');
    return () => {
      root.removeProperty('--assistant-room');
    };
  }, [access]);

  // Ctrl/⌘ + / toggles the panel from anywhere in the portal.
  React.useEffect(() => {
    if (access !== 'available') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (openRef.current) close();
      else activate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [access, activate, close]);

  const value = React.useMemo<AssistantContextValue>(
    () => ({
      access,
      open,
      unread,
      isNew: access === 'available' && !seen && !seenNow,
      activate,
      close,
      prefetch: () => void loadPanel(),
    }),
    [access, open, unread, seen, seenNow, activate, close],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantLauncher />
      {access === 'available' && mounted && config && (
        <AssistantPanel
          open={open}
          config={config}
          chat={chat}
          view={view}
          onViewChange={setView}
          onClose={close}
        />
      )}
      {access === 'locked' && (
        <KycGateDialog
          open={gateOpen}
          onOpenChange={setGateOpen}
          pending={kyc.pending}
          rejected={kyc.rejected}
          reverification={kyc.reverification}
          emailUnverified={kyc.emailUnverified}
          feature="assistant"
        />
      )}
    </AssistantContext.Provider>
  );
}
