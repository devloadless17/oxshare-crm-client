import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import nextConfig from '../../next.config';

/*
 * `public/email/` — the images our emails load, served from THIS app.
 *
 * The backend's email masthead (`modules/email/templates/layout.ts`) points every
 * message at `${PORTAL_URL}/email/oxshare-logo-v1.png`. Nothing in the backend can
 * see this repo, so deleting, renaming or re-encoding the file here would blank the
 * logo in every email already delivered, with no failing test anywhere. This is
 * that test.
 *
 * The rules it pins:
 *  - a file here is NEVER edited or deleted. A new logo is a new version
 *    (`oxshare-logo-v2.png`) beside the old one, which stays for the mail that
 *    uses it. That is what makes a year's `immutable` cache safe;
 *  - the logo is OPAQUE: a transparent PNG is what a mail client's dark-mode
 *    filter tints (one rendered the old logo as a blue tile with a navy mark);
 *  - it is 400×177, twice the 200 px width the email shows it at, so it is sharp
 *    on a high-density screen;
 *  - it stays small, because every open of every email downloads it.
 */

const LOGO = 'public/email/oxshare-logo-v1.png';

/** The chunk names of a PNG, in order — enough to see an alpha or transparency chunk. */
function chunkNames(png: Buffer): string[] {
  const names: string[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    names.push(png.subarray(at + 4, at + 8).toString('latin1'));
    at += 12 + png.readUInt32BE(at);
  }
  return names;
}

describe('the images our emails load (public/email)', () => {
  const png = readFileSync(LOGO);

  it('keeps the masthead logo at the address every email points at', () => {
    expect(png.subarray(0, 8).toString('hex'), 'PNG signature').toBe('89504e470d0a1a0a');
    const chunks = chunkNames(png);
    expect(chunks[0]).toBe('IHDR');
    expect(chunks.at(-1)).toBe('IEND');
  });

  it('is opaque, so no dark-mode filter can tint it', () => {
    // IHDR colour type: 0 = greyscale, 2 = truecolour — neither carries alpha.
    expect([0, 2]).toContain(png[25]);
    expect(chunkNames(png)).not.toContain('tRNS');
  });

  it('is 400×177, twice the width the email shows it at', () => {
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([400, 177]);
  });

  it('stays small — every open of every email downloads it', () => {
    expect(png.length).toBeLessThan(40_000);
  });

  it('is cached for a year and embeddable from any origin', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === '/email/:path*');
    const value = (key: string) => rule?.headers.find((h) => h.key === key)?.value;
    expect(value('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(value('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });
});
