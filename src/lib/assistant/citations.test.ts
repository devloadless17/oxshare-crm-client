import { describe, expect, it } from 'vitest';
import { sourceHost, withoutInlineCitations } from './citations';

describe('web citations', () => {
  it('removes the model’s inline citations and keeps everything else', () => {
    expect(
      withoutInlineCitations(
        'Gold is about **$4,158** ([investing.com](https://www.investing.com/x?utm_source=openai)).',
      ),
    ).toBe('Gold is about **$4,158**.');
    // A portal link and a link inside a sentence are not citations.
    const kept = 'Open [Deposit](/deposit). Read [the report](https://example.com/r).';
    expect(withoutInlineCitations(kept)).toBe(kept);
  });

  it('hides a citation that is still streaming in', () => {
    expect(withoutInlineCitations('Gold is up. ([kit')).toBe('Gold is up.');
    expect(withoutInlineCitations('Gold is up. ([kitco.com](https://www.ki')).toBe('Gold is up.');
    expect(withoutInlineCitations('Gold is up (slightly).')).toBe('Gold is up (slightly).');
    expect(withoutInlineCitations('Needed.\uE200cite\uE202turn0search0\uE201 Next.')).toBe(
      'Needed. Next.',
    );
    expect(withoutInlineCitations('Needed.\uE200cite\uE202tur')).toBe('Needed.');
  });

  it('names a source by its site', () => {
    expect(sourceHost('https://www.reuters.com/markets/gold')).toBe('reuters.com');
    expect(sourceHost('https://sa.marketscreener.com/x')).toBe('marketscreener.com');
    expect(sourceHost('https://finance.yahoo.com/x')).toBe('yahoo.com');
    expect(sourceHost('https://www.lse.co.uk/news')).toBe('lse.co.uk');
    expect(sourceHost('not a url')).toBe('not a url');
  });
});
