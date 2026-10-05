'use client';

import { Lock, Sparkles, X } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAssistant } from './assistant-context';

/**
 * A dot on the launcher: red when an answer finished while the panel was closed
 * (announced), dark for "never opened yet" (decorative, so it is not announced).
 */
function UnreadDot({ unread }: { unread: boolean }) {
  return (
    <span
      aria-hidden={unread ? undefined : true}
      className={cn(
        'absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background',
        unread ? 'bg-destructive' : 'bg-foreground',
      )}
    >
      {unread && <span className="sr-only">{t('assistant.unread')}</span>}
    </span>
  );
}

/**
 * The assistant's launcher: one round button at the bottom-END corner, on every
 * screen (bottom-right in English, bottom-left in Arabic), the place clients
 * know a chat from (owner's call, 5 Oct 2026). It sits on the side opposite the
 * sidebar, so the two never meet.
 *
 * It opens the panel just above itself and turns into a close button while the
 * panel is open, so opening and closing happen in the same place. On a phone
 * the panel fills the screen and has its own close button, so the launcher
 * steps aside while it is open.
 */
export function AssistantLauncher() {
  const { access, open, unread, isNew, activate, close, prefetch } = useAssistant();
  if (access === 'hidden') return null;
  const locked = access === 'locked';
  const label = locked
    ? t('assistant.openLocked')
    : open
      ? t('assistant.close')
      : t('assistant.open');

  return (
    <button
      type="button"
      onClick={() => (open ? close() : activate())}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      aria-label={label}
      aria-expanded={locked ? undefined : open}
      title={label}
      className={cn(
        'fixed end-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[35] flex h-13 w-13 cursor-pointer items-center justify-center rounded-full shadow-lg ring-1 ring-black/5 transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-xl focus-outline active:scale-95 sm:end-6 sm:bottom-6 sm:h-14 sm:w-14',
        locked ? 'bg-card text-muted-foreground' : 'bg-primary text-primary-foreground',
        // A phone's panel covers the screen and carries its own close button.
        open && 'max-sm:hidden',
      )}
    >
      <Sparkles
        aria-hidden="true"
        className={cn(
          'absolute h-6 w-6 transition-[transform,opacity] duration-200',
          open ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <X
        aria-hidden="true"
        className={cn(
          'absolute h-6 w-6 transition-[transform,opacity] duration-200',
          open ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0',
        )}
      />
      {locked && (
        <span className="absolute -end-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted">
          <Lock className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      )}
      {!open && (unread || isNew) && <UnreadDot unread={unread} />}
    </button>
  );
}
