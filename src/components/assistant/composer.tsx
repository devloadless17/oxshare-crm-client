'use client';

import * as React from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The textarea grows with the question up to this height, then scrolls. */
const MAX_HEIGHT_PX = 160;

/**
 * Where the question is written.
 *
 * - Enter sends on a desktop, and Shift+Enter adds a line. On a touch screen,
 *   Enter is a newline and the button sends, as phone keyboards expect.
 * - Nothing sends while an IME is composing. Some keyboards confirm a
 *   composed word with Enter, and sending half a word is the bug this prevents.
 * - The text is kept when a send is refused, so a retry costs no retyping.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  maxLength,
  remainingToday,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  maxLength: number;
  remainingToday: number | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const coarse = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  );

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    // A scrollbar only once the text outgrows the box; before that, rounding drew one.
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, [value, inputRef]);

  const canSend = !streaming && !disabled && value.trim().length > 0;
  const left = maxLength - value.length;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || coarse) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <div className="border-t border-border bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={onKeyDown}
          rows={1}
          dir="auto"
          maxLength={maxLength}
          placeholder={t('assistant.placeholder')}
          aria-label={t('assistant.placeholder')}
          // 16px on phones: below that, iOS Safari zooms the whole page on focus.
          className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-base leading-relaxed outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t('assistant.stop')}
            title={t('assistant.stop')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label={t('assistant.send')}
            title={t('assistant.send')}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 px-1 text-[0.6875rem] leading-snug text-muted-foreground">
        <span>{t('assistant.disclaimer')}</span>
        <span className="shrink-0 tabular-nums">
          {left <= maxLength * 0.2
            ? t('assistant.charsLeft', { count: String(left) })
            : remainingToday !== null && remainingToday <= 10
              ? remainingToday === 1
                ? t('assistant.remainingOne')
                : t('assistant.remaining', { count: String(remainingToday) })
              : null}
        </span>
      </div>
    </div>
  );
}
