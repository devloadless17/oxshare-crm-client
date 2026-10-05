'use client';

import * as React from 'react';
import { AlertCircle, ArrowDown, Globe, Sparkles } from 'lucide-react';
import type { FeedbackReason } from '@/lib/api/assistant';
import { withoutInlineCitations } from '@/lib/assistant/citations';
import { answerDirection } from '@/lib/assistant/direction';
import { currentLocale, t } from '@/lib/i18n';
import { AssistantMarkdown } from './assistant-markdown';
import { MessageActions } from './message-actions';
import { MessageSources } from './message-sources';
import type { ChatMessage } from './use-assistant-chat';

/** Within this many pixels of the bottom, new text keeps the view pinned to it. */
const STICK_THRESHOLD = 80;

export function AssistantAvatar({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9 rounded-xl' : 'h-7 w-7 rounded-lg';
  const icon = size === 'md' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5';
  return (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center bg-primary/10 text-primary`}
    >
      <Sparkles className={icon} />
    </span>
  );
}

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" role="status">
      <span className="sr-only">{t('assistant.thinking')}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

/** Before the first word: the model is reading the latest prices and news, which takes a few seconds. */
function Searching() {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 py-1 text-sm text-muted-foreground"
    >
      <Globe aria-hidden className="h-3.5 w-3.5 animate-pulse motion-reduce:animate-none" />
      {t('assistant.searching')}
    </span>
  );
}

function StatusNote({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  if (message.status === 'aborted') {
    // Stopped before any text arrived: nothing to copy or regenerate from, so offer Try again.
    return (
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t('assistant.stopped')}</span>
        {!message.content && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {t('assistant.retry')}
          </button>
        )}
      </p>
    );
  }
  if (message.status === 'interrupted') {
    return <p className="mt-1 text-xs text-muted-foreground">{t('assistant.interrupted')}</p>;
  }
  if (message.status !== 'failed') return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
      <AlertCircle aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
      <span>
        {message.errorCode === 'TIMEOUT' ? t('assistant.failedTimeout') : t('assistant.failed')}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('assistant.retry')}
        </button>
      )}
    </div>
  );
}

export function MessageList({
  messages,
  streaming,
  onFollowup,
  onRegenerate,
  onRetry,
  onRate,
  onNavigate,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  onFollowup: (question: string) => void;
  onRegenerate: () => void;
  /** A failed answer's "Try again": resends the question or regenerates (see `retry`). */
  onRetry: () => void;
  /** Resolves false when the rating could not be saved (it is then put back). */
  onRate: (messageId: string, rating: 1 | -1 | null, reason?: FeedbackReason) => Promise<boolean>;
  onNavigate: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(true);
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD);
  };

  const toBottom = (smooth: boolean) => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  /*
   * Follow the answer while the reader is at the bottom, and leave them alone
   * once they scroll up. A NEW message (the question they just sent) always
   * brings them back down; the scroll that causes then re-pins `stuck`.
   */
  const count = messages.length;
  const countRef = React.useRef(count);
  React.useLayoutEffect(() => {
    const grew = count !== countRef.current;
    countRef.current = count;
    if (grew || stuck) toBottom(false);
  }, [messages, count, stuck]);

  // Announce each COMPLETED answer to screen readers, never every token.
  const announcement =
    last?.role === 'assistant' && last.status === 'complete' && !streaming
      ? `${t('assistant.answerReady')}. ${last.content}`
      : '';

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain px-4 py-4"
      >
        <ol className="flex flex-col gap-5">
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <li key={message.id} className="flex justify-end">
                <span className="sr-only select-none">{t('assistant.you')}</span>
                <p
                  dir="auto"
                  className="max-w-[85%] rounded-2xl rounded-ee-md bg-muted px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground"
                >
                  {message.content}
                </p>
              </li>
            ) : (
              <li key={message.id} className="group flex gap-2.5">
                <AssistantAvatar />
                <div className="min-w-0 flex-1 pt-0.5">
                  <span className="sr-only select-none">{t('assistant.name')}</span>
                  {message.status === 'streaming' && !message.content ? (
                    message.searching ? (
                      <Searching />
                    ) : (
                      <Thinking />
                    )
                  ) : (
                    <AssistantMarkdown
                      text={withoutInlineCitations(message.content)}
                      dir={answerDirection(
                        messages[index - 1]?.role === 'user' ? messages[index - 1]!.content : '',
                        currentLocale(),
                      )}
                      onNavigate={onNavigate}
                    />
                  )}
                  {message.sources.length > 0 && <MessageSources sources={message.sources} />}
                  <StatusNote
                    message={message}
                    onRetry={index === lastIndex && !streaming ? onRetry : undefined}
                  />
                  {message.status !== 'streaming' && message.content && (
                    <div
                      className={
                        index === lastIndex
                          ? undefined
                          : 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
                      }
                    >
                      <MessageActions
                        message={message}
                        canRegenerate={index === lastIndex && !streaming}
                        onRegenerate={onRegenerate}
                        onRate={(rating, reason) => onRate(message.id, rating, reason)}
                      />
                    </div>
                  )}
                  {index === lastIndex && !streaming && message.followups.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {message.followups.map((question) => (
                        <button
                          key={question}
                          type="button"
                          dir="auto"
                          onClick={() => onFollowup(question)}
                          className="rounded-full border border-border bg-background px-3 py-1 text-start text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>
      </div>
      {!stuck && (
        <button
          type="button"
          onClick={() => {
            setStuck(true);
            toBottom(true);
          }}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-muted"
        >
          <ArrowDown aria-hidden className="h-3.5 w-3.5" />
          {t('assistant.jumpToLatest')}
        </button>
      )}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
