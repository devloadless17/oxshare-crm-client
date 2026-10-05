/**
 * Web citations, as the model writes them and as the client sees them.
 *
 * With web search the model sometimes cites inline, in OpenAI's own form:
 * `([investing.com](https://www.investing.com/…))`. Those pages are already
 * listed under the answer (`sources`), so the inline copy is removed rather
 * than rendered: the Markdown renderer would show it as stray "(investing.com)"
 * text, because it links only to portal pages. A link written into a sentence
 * is left alone: its words belong to the sentence.
 */
const INLINE_CITATION = / ?\(\s*\[[^\]\n]{1,120}\]\(https?:\/\/[^)\s]+\)\s*\)/g;
/**
 * A citation still arriving at the end of a streaming answer, `([kit` or
 * `([kitco.com](https://www.ki`: hidden until it completes and is removed, so it
 * never flickers on screen. "([" almost never starts real prose.
 */
const CITATION_IN_PROGRESS = / ?\(\s*\[[^\]\n]{0,120}(?:\](?:\([^)\s]*)?)?$/;

/** A raw citation marker in private-use characters (`\uE200cite\uE202turn0search0\uE201`), whole or still arriving. */
const CITATION_MARKER = /\uE200[^\uE201]*(?:\uE201|$)/g;

export function withoutInlineCitations(text: string): string {
  return text
    .replace(CITATION_MARKER, '')
    .replace(INLINE_CITATION, '')
    .replace(CITATION_IN_PROGRESS, '');
}

/**
 * The site a source is on, for its chip: `www.reuters.com/…` → `reuters.com`.
 * A regional or section subdomain names the same site (`uk.marketscreener.com`,
 * `finance.yahoo.com`), so one chip stands for it. A two-part country suffix
 * keeps its owner (`lse.co.uk`, `abc.net.au`).
 */
export function sourceHost(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
  const labels = host.split('.');
  const suffixIsTwoPart =
    labels.length >= 3 && (labels.at(-2)?.length ?? 0) <= 3 && (labels.at(-1)?.length ?? 0) === 2;
  return labels.slice(suffixIsTwoPart ? -3 : -2).join('.');
}
