'use client';

import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { assistantApi } from '@/lib/api/assistant';
import { t, type MessageKey } from '@/lib/i18n';
import { keys } from '@/lib/query-keys';
import { AssistantAvatar } from './message-list';

/**
 * The starter questions are FIXED COPY, not AI: each one simply sends its text,
 * exactly as if the client had typed it, and the assistant answers it like any
 * question. Their wording lives in the message catalogues (`assistant.q.*`).
 */

/**
 * When the page has nothing more specific: the market questions clients ask
 * most (from the owner's recording, 5 Oct 2026). Each is answered from live
 * prices and news.
 */
const GENERAL: MessageKey[] = [
  'assistant.q.market1',
  'assistant.q.market2',
  'assistant.q.market3',
  'assistant.q.market4',
];

/**
 * The page's own questions come first. Chosen in the browser from the route:
 * the model is never told where the client is.
 */
const PAGE_QUESTIONS: Record<string, MessageKey[]> = {
  '/deposit': ['assistant.q.deposit1', 'assistant.q.deposit2'],
  '/withdraw': ['assistant.q.withdraw1', 'assistant.q.withdraw2'],
  '/transfer': ['assistant.q.transfer1', 'assistant.q.wallet1'],
  '/accounts': ['assistant.q.accounts1', 'assistant.q.accounts2'],
  '/partner': ['assistant.q.partner1'],
  '/platforms': ['assistant.q.platforms1', 'assistant.q.mt51'],
  '/wallet': ['assistant.q.wallet1', 'assistant.q.transfer1'],
};

/** Four, not a wall: a short list reads as an invitation, a long one as a menu. */
const SHOWN = 4;

function suggestionsFor(pathname: string): MessageKey[] {
  const page = PAGE_QUESTIONS[`/${pathname.split('/')[1] ?? ''}`] ?? [];
  return [...page, ...GENERAL.filter((q) => !page.includes(q))].slice(0, SHOWN);
}

/**
 * The ask screen: a greeting, the chat the client was in, and four questions to
 * start from. The first name comes from the session in the browser and is
 * NEVER sent to the model.
 */
export function EmptyState({
  onAsk,
  onContinue,
}: {
  onAsk: (text: string) => void;
  /** Reopens a past conversation (the "Continue your last chat" card). */
  onContinue: (conversationId: string) => void;
}) {
  const { user } = useUser();
  const pathname = usePathname();
  const name = user?.firstName?.trim();
  // Every open starts here, so the chat the client was in stays one tap away.
  const { data: recent } = useQuery({
    queryKey: keys.assistant.conversations(),
    queryFn: ({ signal }) => assistantApi.conversations(signal),
    staleTime: 30_000,
  });
  const last = recent?.[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-6 pb-4">
      <AssistantAvatar size="md" />
      <h3 dir="auto" className="mt-4 text-lg font-semibold tracking-tight">
        {name ? t('assistant.greeting', { name }) : t('assistant.greetingNoName')}
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{t('assistant.intro')}</p>

      {last && (
        <button
          type="button"
          onClick={() => onContinue(last.id)}
          className="group mt-5 flex w-full items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <History aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              {t('assistant.continueLast')}
            </span>
            <span dir="auto" className="block truncate text-sm ltr:text-left rtl:text-right">
              {last.title ?? t('assistant.untitled')}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          />
        </button>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {suggestionsFor(pathname).map((key) => {
          const text = t(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAsk(text)}
              className="w-full rounded-xl border border-border px-3.5 py-2.5 text-start text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
