'use client';

import * as React from 'react';
import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { FeedbackReason } from '@/lib/api/assistant';
import { withoutInlineCitations } from '@/lib/assistant/citations';
import { t, type MessageKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './use-assistant-chat';

const REASONS: { reason: FeedbackReason; label: MessageKey }[] = [
  { reason: 'wrong', label: 'assistant.reasonWrong' },
  { reason: 'not_helpful', label: 'assistant.reasonNotHelpful' },
  { reason: 'off_topic', label: 'assistant.reasonOffTopic' },
];

function IconAction({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Copy, regenerate (the last answer only) and the rating, under a finished answer. */
export function MessageActions({
  message,
  canRegenerate,
  onRegenerate,
  onRate,
}: {
  message: ChatMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
  /** Resolves false when the rating could not be saved (it is then put back). */
  onRate: (rating: 1 | -1 | null, reason?: FeedbackReason) => Promise<boolean>;
}) {
  const [copied, setCopied] = React.useState(false);
  const [askWhy, setAskWhy] = React.useState(false);
  // Said only once the server has the rating; a failure says so instead of thanking.
  const [note, setNote] = React.useState<'thanks' | 'failed' | null>(null);
  const local = message.id.startsWith('local-');

  const copy = () => {
    // What the client sees, without the inline citations the model wrote.
    void navigator.clipboard?.writeText(withoutInlineCitations(message.content)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const save = async (rating: 1 | -1 | null, reason?: FeedbackReason) => {
    setNote(null);
    if (!(await onRate(rating, reason))) {
      setAskWhy(false);
      setNote('failed');
    } else if (rating === 1 || reason) {
      setNote('thanks');
    }
  };

  const rate = (rating: 1 | -1) => {
    const next = message.feedback === rating ? null : rating;
    // A thumbs-down asks why straight away; the reason is saved as a second rating.
    setAskWhy(next === -1);
    void save(next);
  };

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-0.5">
        <IconAction label={copied ? t('assistant.copied') : t('assistant.copy')} onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </IconAction>
        {canRegenerate && (
          <IconAction label={t('assistant.regenerate')} onClick={onRegenerate}>
            <RefreshCw className="h-3.5 w-3.5" />
          </IconAction>
        )}
        {!local && (
          <>
            <IconAction
              label={t('assistant.helpful')}
              onClick={() => rate(1)}
              pressed={message.feedback === 1}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </IconAction>
            <IconAction
              label={t('assistant.notHelpful')}
              onClick={() => rate(-1)}
              pressed={message.feedback === -1}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </IconAction>
          </>
        )}
      </div>
      {askWhy && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t('assistant.feedbackWhy')}</span>
          {REASONS.map(({ reason, label }) => (
            <button
              key={reason}
              type="button"
              onClick={() => {
                setAskWhy(false);
                void save(-1, reason);
              }}
              className="rounded-full border border-border px-2.5 py-0.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t(label)}
            </button>
          ))}
        </div>
      )}
      {note && !askWhy && (
        <p
          role="status"
          className={cn(
            'mt-1 text-xs',
            note === 'failed' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {note === 'failed' ? t('assistant.feedbackFailed') : t('assistant.feedbackThanks')}
        </p>
      )}
    </div>
  );
}
