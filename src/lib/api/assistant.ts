import type { components } from './types.gen';
import { API_BASE_URL } from '../env';
import { SseParser } from '../assistant/sse';
import { apiClient, apiRequestHeaders, endPortalSession, refreshPortalSession } from './client';

export type AssistantConfig = components['schemas']['AssistantConfigDto'];
export type AssistantConversation = components['schemas']['AssistantConversationDto'];
export type AssistantMessage = components['schemas']['AssistantMessageDto'];
export type AssistantThread = components['schemas']['AssistantThreadDto'];
export type FeedbackReason = 'wrong' | 'not_helpful' | 'off_topic' | 'other';

/**
 * The answer's events, as the backend's `SseAnswerSink` sends them. The
 * protocol is the backend's own, never OpenAI's, so a vendor change cannot
 * break the widget. An event this build does not know is ignored.
 */
export type AnswerEvent =
  | { type: 'meta'; conversationId: string; messageId: string; created: boolean }
  | { type: 'delta'; text: string }
  | { type: 'followups'; questions: string[] }
  | { type: 'done'; messageId: string; finish: string; remainingToday: number }
  | { type: 'error'; code: string };

/**
 * The answer stopped arriving: no response within `CONNECT_TIMEOUT_MS`, or no
 * byte (not even the 15 s heartbeat) within `STALL_TIMEOUT_MS`. The client is
 * told kindly instead of watching a request hang.
 */
export class AssistantTimeoutError extends Error {
  constructor() {
    super('The answer stopped arriving.');
    this.name = 'AssistantTimeoutError';
  }
}

/**
 * An answer's headers come back before the model is even asked, normally well
 * under a second. Ten seconds without them is a stuck connection, not a slow one.
 */
const CONNECT_TIMEOUT_MS = 10_000;
/** The server sends a heartbeat every 15 s: this long with no byte at all means the stream is dead. */
const STALL_TIMEOUT_MS = 35_000;

/** A refusal before the stream opened: the API's JSON error. */
export class AssistantRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssistantRequestError';
  }
}

/**
 * A question's id: a v4 UUID, which is what the API accepts. `randomUUID` exists
 * only in a secure context (https, localhost); `getRandomValues` everywhere.
 */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const assistantApi = {
  async config(signal?: AbortSignal): Promise<AssistantConfig> {
    const { data } = await apiClient.get<AssistantConfig>('/assistant/config', { signal });
    return data;
  },

  async conversations(signal?: AbortSignal): Promise<AssistantConversation[]> {
    const { data } = await apiClient.get<components['schemas']['AssistantConversationListDto']>(
      '/assistant/conversations',
      { signal },
    );
    return data.items;
  },

  async thread(id: string, signal?: AbortSignal): Promise<AssistantThread> {
    const { data } = await apiClient.get<AssistantThread>(`/assistant/conversations/${id}`, {
      signal,
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/assistant/conversations/${id}`);
  },

  async feedback(messageId: string, rating: 1 | -1 | null, reason?: FeedbackReason): Promise<void> {
    await apiClient.put(`/assistant/messages/${messageId}/feedback`, { rating, reason });
  },

  /**
   * Asks a question; `onEvent` receives the answer as it streams. `requestId`
   * names the question: a retry sends the same one, and the server refuses a
   * second copy (`ASSISTANT_DUPLICATE`) rather than answering it twice.
   */
  ask(
    body: { conversationId?: string; question: string; requestId: string },
    onEvent: (event: AnswerEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    return stream('/assistant/ask', body, onEvent, signal);
  },

  regenerate(
    conversationId: string,
    onEvent: (event: AnswerEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    return stream(`/assistant/conversations/${conversationId}/regenerate`, {}, onEvent, signal);
  },
};

/**
 * POSTs and reads the response as an event stream.
 *
 * `fetch` rather than axios, because axios in a browser cannot hand over a body
 * while it is still arriving. What the axios interceptors do for every other
 * call is therefore done here: the same headers (`apiRequestHeaders`), cookies
 * included, and ONE refresh-and-retry on a 401, the access token living 15
 * minutes. A refresh that says the session is over ends it, as axios would.
 */
async function stream(
  path: string,
  body: unknown,
  onEvent: (event: AnswerEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let attempt = await connect(path, body, signal);
  if (attempt.response.status === 401) {
    const outcome = await refreshPortalSession();
    if (outcome === 'dead') {
      endPortalSession();
      throw new AssistantRequestError(401, 'UNAUTHENTICATED', 'Your session has ended.');
    }
    if (outcome === 'renewed') attempt = await connect(path, body, signal);
  }
  const { response, controller } = attempt;
  if (!response.ok || !response.body) {
    throw await requestError(response);
  }

  // The stall watchdog: every chunk, heartbeats included, resets it.
  let stalled = false;
  let watchdog = setTimeout(stall, STALL_TIMEOUT_MS);
  function stall() {
    stalled = true;
    controller.abort();
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new SseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(stall, STALL_TIMEOUT_MS);
      for (const message of parser.push(value)) {
        const event = toEvent(message.event, message.data);
        if (event) onEvent(event);
      }
    }
  } catch (error) {
    if (stalled && !signal.aborted) throw new AssistantTimeoutError();
    throw error;
  } finally {
    clearTimeout(watchdog);
  }
}

/**
 * POSTs the request and waits for the response HEADERS, within
 * `CONNECT_TIMEOUT_MS`.
 *
 * A question that never got an answer at all (a dropped connection, a laptop
 * waking up, a flaky mobile network) is sent ONCE more. That is safe because it
 * carries its own id: if the first copy did reach the server, the second is
 * refused as a duplicate and the portal shows the answer the first one started.
 * A regenerate carries no id, so it is never resent, and neither is a TIMEOUT:
 * then the server has the request and is slow, and a copy would wait behind it.
 *
 * The returned controller outlives this call: it is what the stall watchdog
 * aborts, and it follows the caller's own signal (Stop, closing the panel).
 */
async function connect(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<{ response: Response; controller: AbortController }> {
  const resendable = typeof (body as { requestId?: unknown }).requestId === 'string';
  for (let tries = 0; ; tries += 1) {
    const controller = new AbortController();
    const follow = () => controller.abort();
    signal.addEventListener('abort', follow, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CONNECT_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...apiRequestHeaders('post'),
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { response, controller };
    } catch (error) {
      signal.removeEventListener('abort', follow);
      // Stop, or the panel closed: not a failure, and never retried.
      if (signal.aborted) throw error;
      if (timedOut) throw new AssistantTimeoutError();
      if (resendable && tries === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function requestError(response: Response): Promise<AssistantRequestError> {
  let code = 'UNKNOWN';
  let message = response.statusText;
  try {
    const json = (await response.json()) as { code?: unknown; message?: unknown };
    if (typeof json.code === 'string') code = json.code;
    if (typeof json.message === 'string') message = json.message;
  } catch {
    // Not JSON (a proxy's error page): the status alone decides.
  }
  return new AssistantRequestError(response.status, code, message);
}

function toEvent(name: string, raw: string): AnswerEvent | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (name) {
    case 'meta':
      return {
        type: 'meta',
        conversationId: String(data['conversationId']),
        messageId: String(data['messageId']),
        created: data['created'] === true,
      };
    case 'delta':
      return typeof data['text'] === 'string' ? { type: 'delta', text: data['text'] } : null;
    case 'followups':
      return Array.isArray(data['questions'])
        ? {
            type: 'followups',
            questions: data['questions'].filter((q): q is string => typeof q === 'string'),
          }
        : null;
    case 'done':
      return {
        type: 'done',
        messageId: String(data['messageId']),
        finish: String(data['finish']),
        remainingToday: typeof data['remainingToday'] === 'number' ? data['remainingToday'] : 0,
      };
    case 'error':
      return { type: 'error', code: String(data['code']) };
    default:
      return null;
  }
}
