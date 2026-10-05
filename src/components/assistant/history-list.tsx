'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2 } from 'lucide-react';
import { AsyncBoundary } from '@/components/async-boundary';
import { useResource } from '@/hooks/use-resource';
import { assistantApi, type AssistantConversation } from '@/lib/api/assistant';
import { t, useTranslation } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

function useWhen() {
  const { locale } = useTranslation();
  return React.useMemo(() => {
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
    return (iso: string) => {
      const date = new Date(iso);
      return date.toDateString() === new Date().toDateString()
        ? time.format(date)
        : day.format(date);
    };
  }, [locale]);
}

function Row({
  conversation,
  active,
  onOpen,
  onDeleted,
}: {
  conversation: AssistantConversation;
  active: boolean;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const when = useWhen();
  const [confirming, setConfirming] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const remove = async () => {
    try {
      await assistantApi.remove(conversation.id);
      onDeleted();
    } catch {
      setFailed(true);
    }
  };

  if (confirming) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-lg bg-destructive/5 px-3 py-2.5 text-sm">
        <span>{failed ? t('assistant.deleteFailed') : t('assistant.deleteConfirm')}</span>
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            {t('assistant.deleteYes')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setFailed(false);
            }}
            className="rounded-md px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            {t('assistant.deleteNo')}
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 pe-10 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          active && 'bg-muted',
        )}
      >
        <MessageSquare aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          {/*
            The title reads in its OWN direction, so a long one is cut at its
            end, never its start; it aligns with the row in either language.
          */}
          <span dir="auto" className="block truncate text-sm ltr:text-left rtl:text-right">
            {conversation.title ?? t('assistant.untitled')}
          </span>
          <span className="text-xs text-muted-foreground">{when(conversation.lastMessageAt)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={t('assistant.delete')}
        title={t('assistant.delete')}
        className="absolute end-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Past chats, newest first. Opening one replaces the current thread; deleting is permanent. */
export function HistoryList({
  activeId,
  onOpen,
  onDeletedActive,
}: {
  activeId: string | null;
  onOpen: (id: string) => void;
  onDeletedActive: () => void;
}) {
  const queryClient = useQueryClient();
  const resource = useResource(keys.assistant.conversations(), (signal) =>
    assistantApi.conversations(signal),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
      <AsyncBoundary
        status={resource.status}
        label={t('assistant.historyLoading')}
        endpoints={['GET /v1/assistant/conversations']}
        onRetry={resource.refetch}
      >
        {resource.data && resource.data.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {t('assistant.historyEmpty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {resource.data?.map((conversation) => (
              <Row
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                onOpen={() => onOpen(conversation.id)}
                onDeleted={() => {
                  if (conversation.id === activeId) onDeletedActive();
                  void queryClient.invalidateQueries({ queryKey: keys.assistant.conversations() });
                }}
              />
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </div>
  );
}
