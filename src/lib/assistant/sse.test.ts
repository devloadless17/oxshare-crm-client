import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

/**
 * The network splits a stream anywhere. A parser that assumed one event per
 * chunk would drop or garble answers on a slow connection, and only there.
 */
describe('SseParser', () => {
  const stream =
    ': ping\n\n' +
    'event: meta\ndata: {"conversationId":"c1"}\n\n' +
    'event: delta\ndata: {"text":"مرحبا"}\n\n' +
    'event: delta\ndata: {"text":"line one"}\r\n\r\n' +
    'event: done\ndata: {"finish":"stop"}\n\n';

  const expected = [
    { event: 'meta', data: '{"conversationId":"c1"}' },
    { event: 'delta', data: '{"text":"مرحبا"}' },
    { event: 'delta', data: '{"text":"line one"}' },
    { event: 'done', data: '{"finish":"stop"}' },
  ];

  it('reads a stream delivered whole, skipping heartbeats', () => {
    expect(new SseParser().push(stream)).toEqual(expected);
  });

  it('reads the same stream split at every possible point', () => {
    for (let cut = 1; cut < stream.length; cut += 1) {
      const parser = new SseParser();
      const events = [...parser.push(stream.slice(0, cut)), ...parser.push(stream.slice(cut))];
      expect(events, `split at ${cut}`).toEqual(expected);
    }
  });

  it('reads a stream delivered one character at a time', () => {
    const parser = new SseParser();
    const events = [...stream].flatMap((ch) => parser.push(ch));
    expect(events).toEqual(expected);
  });

  it('joins multi-line data and holds back an unfinished event', () => {
    const parser = new SseParser();
    expect(parser.push('event: delta\ndata: a\ndata: b\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'delta', data: 'a\nb' }]);
  });
});
