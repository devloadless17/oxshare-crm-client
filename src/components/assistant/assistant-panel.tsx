'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  SquarePen,
  WifiOff,
  X,
} from 'lucide-react';
import type { AssistantConfig } from '@/lib/api/assistant';
import { intlLocale, t, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { HistoryList } from './history-list';
import { AssistantAvatar, MessageList } from './message-list';
import type { AssistantChat, ChatNotice } from './use-assistant-chat';

/** A notice's sentence, by code. Anything else reads as "could not be sent". */
const NOTICE_COPY: Record<string, MessageKey> = {
  ASSISTANT_RATE_LIMITED: 'assistant.rateLimited',
  ASSISTANT_BUSY: 'assistant.busy',
  ASSISTANT_CAPACITY: 'assistant.capacity',
  ASSISTANT_UNAVAILABLE: 'assistant.unavailable',
  ASSISTANT_CONVERSATION_FULL: 'assistant.conversationFull',
  KYC_NOT_VERIFIED: 'assistant.unavailable',
  UNAUTHENTICATED: 'assistant.sessionEnded',
  CHAT_GONE: 'assistant.chatGone',
  LOAD_FAILED: 'assistant.loadFailed',
};

function noticeText(notice: ChatNotice, resetsAt: string | undefined): string {
  if (notice.code === 'ASSISTANT_DAILY_LIMIT') {
    const time = resetsAt
      ? new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(
          new Date(resetsAt),
        )
      : '';
    return t('assistant.limitReached', { time });
  }
  return t(NOTICE_COPY[notice.code] ?? 'assistant.sendFailed');
}

/**
 * The VISIBLE screen, as CSS variables. On a phone the panel fills the screen,
 * and when the keyboard opens the visible part shrinks while the layout does
 * not (iOS Safari): sized from these, the box stays above the keyboard.
 */
function useVisibleViewport(): React.CSSProperties {
  const snapshot = React.useSyncExternalStore(
    (notify) => {
      const viewport = window.visualViewport;
      viewport?.addEventListener('resize', notify);
      viewport?.addEventListener('scroll', notify);
      return () => {
        viewport?.removeEventListener('resize', notify);
        viewport?.removeEventListener('scroll', notify);
      };
    },
    () => {
      const viewport = window.visualViewport;
      return viewport ? `${Math.round(viewport.height)}|${Math.round(viewport.offsetTop)}` : '';
    },
    () => '',
  );
  if (!snapshot) return {};
  const [height, top] = snapshot.split('|');
  return { '--vv-height': `${height}px`, '--vv-top': `${top}px` } as React.CSSProperties;
}

function useOnline(): boolean {
  return React.useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-8 sm:w-8',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The assistant's window. Mounted on first open and then only HIDDEN when
 * closed, so an answer keeps streaming while the client reads the page, and
 * the thread is still there when they come back.
 */
export default function AssistantPanel({
  open,
  config,
  chat,
  view,
  onViewChange: setView,
  onClose,
}: {
  open: boolean;
  config: AssistantConfig;
  /** The conversation, owned by `AssistantProvider` (which decides what an open shows). */
  chat: AssistantChat;
  view: 'chat' | 'history';
  onViewChange: (view: 'chat' | 'history') => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const visibleViewport = useVisibleViewport();
  const [expanded, setExpanded] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const remainingToday = Math.max(0, config.dailyLimit - config.usedToday);

  // Focus the box with a mouse; on a touch screen that would pop the keyboard over the suggestions.
  React.useEffect(() => {
    if (open && view === 'chat' && window.matchMedia('(pointer: fine)').matches) {
      inputRef.current?.focus();
    }
  }, [open, view]);

  const ask = async (text: string, fromComposer = false) => {
    if (!online || chat.streaming) return;
    setView('chat');
    if (fromComposer) setDraft('');
    const accepted = await chat.send(text);
    // Refused before it streamed: give the typed question back to edit or resend.
    if (!accepted && fromComposer) setDraft(text);
  };

  // On a phone the panel covers the page: following a link must reveal it.
  const onNavigate = React.useCallback(() => {
    if (window.matchMedia('(max-width: 639px)').matches) onClose();
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={t('assistant.name')}
      hidden={!open}
      style={visibleViewport}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className={cn(
        'fixed inset-0 z-[35] flex flex-col overflow-hidden bg-card text-card-foreground',
        // Phones: exactly the visible screen, so the keyboard never covers the composer.
        'max-sm:top-[var(--vv-top,0px)] max-sm:bottom-auto max-sm:h-[var(--vv-height,100dvh)]',
        /*
         * Wider screens: just above the launcher at the bottom-end corner, the
         * side opposite the sidebar. Even expanded (44rem) it clears the 16rem
         * sidebar at every desktop width, so it never needs to know the sidebar.
         */
        'sm:inset-auto sm:end-6 sm:bottom-24 sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl',
        'origin-bottom-right animate-in fade-in-0 zoom-in-95 rtl:origin-bottom-left',
        // 11rem = 6rem under it (the launcher) + the 4rem top bar + 1rem clear of it.
        expanded
          ? 'sm:h-[calc(100dvh-11rem)] sm:w-[min(44rem,calc(100vw-3rem))]'
          : 'sm:h-[min(40rem,calc(100dvh-11rem))] sm:w-[25rem]',
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
        {view === 'history' ? (
          <HeaderButton label={t('assistant.backToChat')} onClick={() => setView('chat')}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </HeaderButton>
        ) : (
          <AssistantAvatar />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm leading-tight font-semibold">
            {view === 'history' ? t('assistant.history') : t('assistant.name')}
          </h2>
          {view === 'chat' && (
            <p className="truncate text-xs text-muted-foreground" aria-live="polite">
              {chat.streaming ? t('assistant.statusAnswering') : t('assistant.tagline')}
            </p>
          )}
        </div>
        {view === 'chat' && (
          <HeaderButton label={t('assistant.history')} onClick={() => setView('history')}>
            <History className="h-4 w-4" />
          </HeaderButton>
        )}
        <HeaderButton
          label={t('assistant.newChat')}
          onClick={() => {
            chat.newChat();
            setDraft('');
            setView('chat');
          }}
        >
          <SquarePen className="h-4 w-4" />
        </HeaderButton>
        <HeaderButton
          label={expanded ? t('assistant.collapse') : t('assistant.expand')}
          onClick={() => setExpanded((v) => !v)}
          className="hidden sm:inline-flex"
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </HeaderButton>
        <HeaderButton label={t('assistant.close')} onClick={onClose}>
          <X className="h-4 w-4" />
        </HeaderButton>
      </header>

      {view === 'history' ? (
        <HistoryList
          activeId={chat.conversationId}
          onOpen={(id) => {
            // The chat view first, so a failure's notice is seen where it is shown.
            setView('chat');
            void chat.openConversation(id);
          }}
          onDeletedActive={chat.newChat}
        />
      ) : chat.messages.length === 0 && chat.loadingThread ? (
        <div role="status" className="flex flex-1 items-center justify-center">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : chat.messages.length === 0 ? (
        <EmptyState
          onAsk={(text) => void ask(text)}
          onContinue={(id) => void chat.openConversation(id)}
        />
      ) : (
        <MessageList
          messages={chat.messages}
          streaming={chat.streaming}
          onFollowup={(q) => void ask(q)}
          onRegenerate={() => void chat.regenerate()}
          onRetry={() => void chat.retry()}
          onRate={chat.rate}
          onNavigate={onNavigate}
        />
      )}

      {view === 'chat' && (
        <>
          {(!online || chat.notice) && (
            <div
              role="alert"
              className="flex items-start gap-2 border-t border-border bg-warning/10 px-4 py-2.5 text-xs"
            >
              {online ? (
                <AlertCircle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1">
                {online && chat.notice
                  ? noticeText(chat.notice, config.resetsAt)
                  : t('assistant.offline')}
              </span>
              {online && chat.notice && (
                <button
                  type="button"
                  onClick={chat.dismissNotice}
                  aria-label={t('assistant.dismiss')}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void ask(draft, true)}
            onStop={chat.stop}
            streaming={chat.streaming}
            disabled={!online || chat.loadingThread}
            maxLength={config.maxQuestionLength}
            remainingToday={remainingToday}
            inputRef={inputRef}
          />
        </>
      )}
    </section>
  );
}
