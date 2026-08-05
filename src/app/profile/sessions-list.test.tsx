import { describe, expect, it } from 'vitest';
import { describeDevice } from './sessions-list';

/**
 * The session row exists to answer one question: "is one of these not me".
 *
 * That makes the device string the load-bearing part of the row — everything
 * else (expiry, family id) is either identical across rows or meaningless to a
 * client. These pin the cases that decide whether a row is recognisable.
 */
describe('describeDevice', () => {
  it('names the browser and the platform', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');

    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS');
  });

  it('does not mistake Edge or Opera for Chrome', () => {
    /*
     * Both send a UA containing `Chrome/`, and Chrome's contains `Safari/`.
     * A naive ordered match reports every Edge session as Chrome — which is
     * precisely the kind of wrongness that makes a client dismiss a row they
     * should have looked at.
     */
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ),
    ).toBe('Edge on Windows');

    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
      ),
    ).toBe('Opera on Windows');
  });

  it('says so when nothing was recorded', () => {
    /*
     * Every session that predates the `user_agent` / `ip` columns has null
     * here, and there is no backfilling them — the requests that would have
     * carried the data are long gone.
     *
     * The important part is that it is not an empty string. A blank cell in a
     * security list reads as a failed load, which invites the client to ignore
     * the row rather than notice it.
     */
    for (const empty of [null, undefined, '']) {
      expect(describeDevice(empty)).toBeTruthy();
      expect(describeDevice(empty)).not.toBe('');
    }
    expect(describeDevice(null)).toMatch(/no device details/i);
  });

  it('falls back to whichever half it recognises', () => {
    // Half an answer beats "Unknown device": a client who runs exactly one
    // Linux machine can still identify it.
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
    expect(describeDevice('Firefox/121.0')).toBe('Firefox');
  });

  it('never throws on a UA it cannot parse at all', () => {
    // The value is whatever a client sent, including something hand-crafted.
    // A crash here would take out the whole security screen.
    for (const junk of ['', '   ', 'curl/8.4.0', '<script>alert(1)</script>', '💀'.repeat(50)]) {
      expect(() => describeDevice(junk)).not.toThrow();
    }
  });
});
