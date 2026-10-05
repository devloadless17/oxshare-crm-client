'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AssistantRequestError,
  AssistantTimeoutError,
  assistantApi,
  newRequestId,
  type AnswerEvent,
  type AssistantSource,
  type AssistantThread,
  type FeedbackReason,
} from '@/lib/api/assistant';
import { keys } from '@/lib/query-keys';

export type ChatStatus =
  'streaming' | 'complete' | 'aborted' | 'failed' | 'refused' | 'interrupted';

export interface ChatMessage {
  /** The server's id once known; a local one until `meta` arrives. */
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: ChatStatus;
  followups: string[];
  /** Web pages the answer cited, shown under it. */
  sources: AssistantSource[];
  /** True while the model searches the web and nothing is written yet. */
  searching?: boolean;
  feedback: 1 | -1 | null;
  /** Why it failed: `TIMEOUT`, `UPSTREAM`… */
  errorCode?: string;
  /**
   * On an answer whose question the server has not confirmed (no `meta` came):
   * the question's id. "Try again" resends the question under it, so a question
   * that did arrive is never asked twice.
   */
  requestId?: string;
}

/** Shown above the composer: an API refusal's code, or `CHAT_GONE` / `LOAD_FAILED`. */
export interface ChatNotice {
  code: string;
}

let localIds = 0;
const localId = () => `local-${++localIds}`;

function placeholder(requestId?: string): ChatMessage {
  return {
    id: localId(),
    role: 'assistant',
    content: '',
    status: 'streaming',
    followups: [],
    sources: [],
    feedback: null,
    ...(requestId ? { requestId } : {}),
  };
}

/** While an answer elsewhere (another tab, a lost response) is being written: every 2 s, up to 90 s. */
const POLL_MS = 2_000;
const POLL_TRIES = 45;

/**
 * The assistant's conversation state.
 *
 * Deltas arrive many times a second. They are collected in a ref and painted
 * once per animation frame, so a long answer streams smoothly instead of
 * re-rendering the whole thread on every few characters.
 *
 * A refusal (nothing streamed: a limit, busy, the chat deleted) leaves the
 * thread as it was before the attempt, with a notice saying why.
 */
export function useAssistantChat(options: { onAnswerSettled?: () => void } = {}) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [notice, setNotice] = React.useState<ChatNotice | null>(null);
  const [loadingThread, setLoadingThread] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const pendingRef = React.useRef('');
  const frameRef = React.useRef<number | null>(null);
  const answerIdRef = React.useRef<string | null>(null);
  /** The conversation on screen, for answers that land after the client moved on. */
  const viewingRef = React.useRef<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSettledRef = React.useRef(options.onAnswerSettled);
  React.useEffect(() => {
    onSettledRef.current = options.onAnswerSettled;
  }, [options.onAnswerSettled]);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current !== null) clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  const patchAnswer = React.useCallback((patch: (m: ChatMessage) => ChatMessage) => {
    const id = answerIdRef.current;
    setMessages((all) => all.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const flush = React.useCallback(() => {
    frameRef.current = null;
    const text = pendingRef.current;
    if (!text) return;
    pendingRef.current = '';
    patchAnswer((m) => ({ ...m, content: m.content + text, searching: false }));
  }, [patchAnswer]);

  const onEvent = React.useCallback(
    (event: AnswerEvent) => {
      switch (event.type) {
        case 'meta': {
          const previous = answerIdRef.current;
          answerIdRef.current = event.messageId;
          // Confirmed: the server has the question, so it is never resent.
          setMessages((all) =>
            all.map((m) =>
              m.id === previous ? { ...m, id: event.messageId, requestId: undefined } : m,
            ),
          );
          setConversationId(event.conversationId);
          viewingRef.current = event.conversationId;
          break;
        }
        case 'status':
          patchAnswer((m) => (m.content ? m : { ...m, searching: true }));
          break;
        case 'sources':
          patchAnswer((m) => ({ ...m, sources: event.items }));
          break;
        case 'delta':
          pendingRef.current += event.text;
          frameRef.current ??= requestAnimationFrame(flush);
          break;
        case 'followups':
          flush();
          patchAnswer((m) => ({ ...m, followups: event.questions }));
          break;
        case 'done':
          flush();
          patchAnswer((m) => ({
            ...m,
            status: event.finish === 'refused' ? 'refused' : 'complete',
          }));
          break;
        case 'error':
          flush();
          patchAnswer((m) => ({ ...m, status: 'failed', errorCode: event.code }));
          break;
      }
    },
    [flush, patchAnswer],
  );

  /**
   * Shows a thread from the server. An answer still being written (by another
   * tab, or one whose response was lost on the way) is shown as being written,
   * and the thread is read again until it is done.
   */
  const applyThread = React.useCallback(
    (id: string, thread: AssistantThread, triesLeft = POLL_TRIES) => {
      stopPolling();
      const lastIndex = thread.messages.length - 1;
      const writing = thread.messages[lastIndex]?.status === 'streaming';
      setMessages(
        thread.messages.map((m, index) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          // Still streaming after the polls ran out: the instance writing it died.
          status: m.status === 'streaming' && triesLeft <= 0 ? 'interrupted' : m.status,
          // The suggestions of the answer the chat ended on, as when it was written.
          followups: index === lastIndex && m.role === 'assistant' ? m.followups : [],
          sources: m.sources,
          feedback: m.feedback,
        })),
      );
      setConversationId(id);
      viewingRef.current = id;
      setNotice(null);
      if (!writing || triesLeft <= 0) return;
      pollRef.current = setTimeout(() => {
        void assistantApi
          .thread(id)
          .then((fresh) => {
            if (viewingRef.current === id) applyThread(id, fresh, triesLeft - 1);
          })
          .catch(() => {
            if (viewingRef.current === id) setNotice({ code: 'LOAD_FAILED' });
          });
      }, POLL_MS);
    },
    [stopPolling],
  );

  /** Opens a past chat. Refused while an answer is streaming, which would land in the wrong thread. */
  const openConversation = React.useCallback(
    async (id: string): Promise<boolean> => {
      if (abortRef.current) {
        setNotice({ code: 'ASSISTANT_BUSY' });
        return false;
      }
      setLoadingThread(true);
      try {
        applyThread(id, await assistantApi.thread(id));
        return true;
      } catch {
        setNotice({ code: 'LOAD_FAILED' });
        return false;
      } finally {
        setLoadingThread(false);
      }
    },
    [applyThread],
  );

  /** Streams one answer into the placeholder `answerIdRef` names. A refusal is returned, not thrown. */
  const runAnswer = React.useCallback(
    async (
      start: (signal: AbortSignal) => Promise<void>,
    ): Promise<AssistantRequestError | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      stopPolling();
      setStreaming(true);
      setNotice(null);
      try {
        await start(controller.signal);
        flush();
        // A stream that ended without `done` was cut off on the way.
        patchAnswer((m) => (m.status === 'streaming' ? { ...m, status: 'failed' } : m));
        return null;
      } catch (error) {
        flush();
        if (controller.signal.aborted) {
          patchAnswer((m) => ({ ...m, status: 'aborted' }));
          return null;
        }
        if (error instanceof AssistantRequestError) return error;
        patchAnswer((m) => ({
          ...m,
          status: 'failed',
          errorCode:
            error instanceof AssistantTimeoutError ? 'TIMEOUT' : m.content ? 'UPSTREAM' : 'NETWORK',
        }));
        return null;
      } finally {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        abortRef.current = null;
        setStreaming(false);
        void queryClient.invalidateQueries({ queryKey: keys.assistant.all() });
        onSettledRef.current?.();
      }
    },
    [flush, patchAnswer, queryClient, stopPolling],
  );

  /**
   * What a refusal does to the thread. `undo` removes what the attempt added.
   * Returns true when the question is taken care of after all.
   */
  const settleRefusal = React.useCallback(
    async (refusal: AssistantRequestError, undo: () => void): Promise<boolean> => {
      if (refusal.code === 'NOT_FOUND') {
        // Deleted in another tab, or expired: start over, saying so.
        stopPolling();
        viewingRef.current = null;
        setMessages([]);
        setConversationId(null);
        setNotice({ code: 'CHAT_GONE' });
        return false;
      }
      undo();
      if (refusal.code !== 'ASSISTANT_DUPLICATE') {
        setNotice({ code: refusal.code });
        return false;
      }
      /*
       * The server already has this question: the answer to the first copy was
       * lost on the way. Show the chat it is answered in rather than asking
       * twice. Its id is known, unless it was the chat's first question, which
       * makes that chat the latest.
       */
      const id =
        conversationId ??
        (await assistantApi.conversations().then(
          (list) => list[0]?.id ?? null,
          () => null,
        ));
      if (id) return openConversation(id);
      setNotice({ code: 'LOAD_FAILED' });
      return false;
    },
    [conversationId, openConversation, stopPolling],
  );

  /** Streams the answer to `question` into `answer` (a placeholder carrying the question's id). */
  const ask = React.useCallback(
    async (question: string, answer: ChatMessage, undo: () => void): Promise<boolean> => {
      answerIdRef.current = answer.id;
      const requestId = answer.requestId ?? newRequestId();
      const refusal = await runAnswer((signal) =>
        assistantApi.ask(
          { conversationId: conversationId ?? undefined, question, requestId },
          onEvent,
          signal,
        ),
      );
      return refusal ? settleRefusal(refusal, undo) : true;
    },
    [conversationId, onEvent, runAnswer, settleRefusal],
  );

  /** Asks a question. Returns false when it was refused, so the composer gives the text back. */
  const send = React.useCallback(
    async (question: string): Promise<boolean> => {
      const text = question.trim();
      if (!text || abortRef.current) return false;
      const userRow: ChatMessage = {
        id: localId(),
        role: 'user',
        content: text,
        status: 'complete',
        followups: [],
        sources: [],
        feedback: null,
      };
      const answer = placeholder(newRequestId());
      setMessages((all) => [...all, userRow, answer]);
      return ask(text, answer, () =>
        setMessages((all) => all.filter((m) => m.id !== userRow.id && m.id !== answer.id)),
      );
    },
    [ask],
  );

  /** Replaces the last answer with a placeholder; `undo` puts the old one back. */
  const replaceLast = React.useCallback((last: ChatMessage, next: ChatMessage) => {
    setMessages((all) => all.map((m) => (m.id === last.id ? next : m)));
    return () => setMessages((all) => all.map((m) => (m.id === next.id ? last : m)));
  }, []);

  const regenerate = React.useCallback(async () => {
    const last = messages[messages.length - 1];
    if (!conversationId || !last || last.role !== 'assistant' || abortRef.current) return;
    const answer = placeholder();
    const undo = replaceLast(last, answer);
    answerIdRef.current = answer.id;
    const refusal = await runAnswer((signal) =>
      assistantApi.regenerate(conversationId, onEvent, signal),
    );
    if (refusal) await settleRefusal(refusal, undo);
  }, [conversationId, messages, onEvent, replaceLast, runAnswer, settleRefusal]);

  /**
   * "Try again" on a failed answer. A question the server never confirmed is
   * sent again under ITS OWN id: if it did arrive after all, it is refused as a
   * duplicate and the existing answer is shown instead. Otherwise, regenerate.
   */
  const retry = React.useCallback(async () => {
    const last = messages[messages.length - 1];
    const question = messages[messages.length - 2];
    if (!last || last.role !== 'assistant' || abortRef.current) return;
    if (!last.requestId || question?.role !== 'user') {
      await regenerate();
      return;
    }
    const answer = placeholder(last.requestId);
    await ask(question.content, answer, replaceLast(last, answer));
  }, [ask, messages, regenerate, replaceLast]);

  const stop = React.useCallback(() => abortRef.current?.abort(), []);

  const newChat = React.useCallback(() => {
    abortRef.current?.abort();
    stopPolling();
    viewingRef.current = null;
    setMessages([]);
    setConversationId(null);
    setNotice(null);
  }, [stopPolling]);

  /** Records a rating. Returns false, with the previous rating restored, when it could not be saved. */
  const rate = React.useCallback(
    async (messageId: string, rating: 1 | -1 | null, reason?: FeedbackReason) => {
      const previous = messages.find((m) => m.id === messageId)?.feedback ?? null;
      const show = (feedback: 1 | -1 | null) =>
        setMessages((all) => all.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
      show(rating);
      try {
        await assistantApi.feedback(messageId, rating, reason);
        return true;
      } catch {
        show(previous);
        return false;
      }
    },
    [messages],
  );

  const dismissNotice = React.useCallback(() => setNotice(null), []);

  // Leaving the portal stops an answer in flight; the server keeps what was written.
  React.useEffect(
    () => () => {
      abortRef.current?.abort();
      stopPolling();
    },
    [stopPolling],
  );

  return {
    messages,
    conversationId,
    streaming,
    notice,
    loadingThread,
    send,
    stop,
    regenerate,
    retry,
    newChat,
    openConversation,
    rate,
    dismissNotice,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
