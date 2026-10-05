/**
 * A Server-Sent Events parser for a streamed `fetch` body.
 *
 * `EventSource` cannot POST or send our anti-forgery header, so the assistant
 * reads its stream with `fetch` and parses it here. Network chunks split
 * events anywhere (mid-line, mid-character, between `\r` and `\n`), so the
 * parser buffers until an event's blank line arrives. Comment lines (`: ping`,
 * the server's heartbeat) are skipped. Pure, no I/O: `sse.test.ts` feeds it
 * awkward chunkings.
 */
export interface SseMessage {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  /** Feed decoded text; get back every event it completed. */
  push(text: string): SseMessage[] {
    this.buffer += text;
    const messages: SseMessage[] = [];
    for (;;) {
      const match = /\r\n\r\n|\n\n|\r\r/.exec(this.buffer);
      if (!match) break;
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const message = parseBlock(block);
      if (message) messages.push(message);
    }
    return messages;
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}
