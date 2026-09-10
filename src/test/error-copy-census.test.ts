import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO SCREEN MAY PRE-RESOLVE ITS OWN ERROR MESSAGE, AND NONE MAY DROP THE API'S.
 *
 * `AsyncBoundary` renders the caller's sentence with the API's reason beneath
 * it — `headline = errorMessage`, `detail = apiErrorMessage(error, '')`, the
 * detail dropped when the two are equal so a card never says one thing twice.
 * Two props, and the guarantee needs BOTH of them.
 *
 * ## Rule 1 — do not resolve it for the boundary
 *
 *     errorMessage={apiErrorMessage(query.error, t('x.loadFailed'))}
 *
 * arrives already resolved to the API's message, `detail` resolves to the same
 * string, they compare equal, the dedup drops the second line — and the
 * screen's own sentence never appears. The component is correct and the caller
 * has taken the decision away from it.
 *
 * Seventeen portal screens and nine admin ones were written this way, and every
 * one was REASONABLE when written: the component used to throw the caller's
 * line away, so screens resolved the message themselves to get anything useful
 * onto the card. They were working around a defect. When the defect was fixed
 * the workarounds became the defect — they are why the fix reached 39 of 65
 * screens while being reported as closed.
 *
 * That is the shape worth guarding: a workaround outlives the bug it was for,
 * is indistinguishable from ordinary code once the bug is gone, and nothing
 * fails.
 *
 * ## Rule 2 — do not withhold the error
 *
 * `errorMessage` without `error` is the same defect through the other door: the
 * screen states what failed and the API's reason is silently absent, which is
 * the half `apiErrorMessage` was reached for in the first place. This rule
 * exists because rule 1's failure message ASKED for it in prose — "keep
 * error={…} so there is something to resolve" — and prose beside an unchecked
 * guarantee is the exact pattern this whole sweep has been chasing. Found by
 * `crm-6a` reading this file adversarially.
 *
 * ## Parsed per TAG, not per line
 *
 * The two props are normally on separate lines, so a line-based rule cannot see
 * rule 2 at all. It also cannot see a call site the formatter has wrapped.
 * Prettier happens to keep `errorMessage={apiErrorMessage(` contiguous today —
 * `crm-6a` verified that by running it on a deliberately over-width site rather
 * than predicting it — but a rule that holds only because of how the current
 * formatter breaks lines is a rule with a version number on it. `withdraw/page.tsx`
 * already sits at 102 characters against `printWidth: 100`, so the wrap case is
 * reachable in real code rather than hypothetical.
 *
 * ## Deliberately a test, not a lint rule
 *
 * `eslint.config.mjs` merges `no-restricted-syntax` by NAME across flat-config
 * blocks, so a new standalone block silently replaces the options of every
 * earlier one — which is how the §6.1 `Number()` ban on the money path was
 * disarmed once already. A rule here would have to be spread into every
 * existing block. This costs one file and can disarm nothing else.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Every `<AsyncBoundary …>` OPENING TAG, with its source location.
 *
 * ⚠️ THE SCAN TRACKS BRACE DEPTH, and the first version of this file did not.
 * It used a non-greedy `/<AsyncBoundary\b[\s\S]*?>/`, which stops at the first
 * `>` in the source — and that `>` is the arrow in `onRetry={() => …}`, a prop
 * this codebase puts on nearly every boundary. So the captured "tag" ended
 * before `errorMessage` was ever reached, and BOTH rules below reported zero
 * offenders because they could not see a single call site.
 *
 * It passed. It would have gone on passing, over sixty-five screens, while
 * checking nothing — the precise failure this file exists to prevent, inside
 * the file that prevents it. It was caught by mutation-testing the rule rather
 * than by reading it: a deliberately reintroduced offender did not turn it red.
 *
 * A `>` inside a prop expression is therefore not the end of the tag. Depth
 * zero is.
 */
function boundaryTags(): { file: string; line: number; tag: string }[] {
  return walk(SRC)
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const found: { file: string; line: number; tag: string }[] = [];

      for (let at = source.indexOf('<AsyncBoundary'); at !== -1;) {
        let depth = 0;
        let end = at;
        for (let i = at; i < source.length; i += 1) {
          const ch = source[i];
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
          else if (ch === '>' && depth === 0) {
            end = i;
            break;
          }
        }
        found.push({
          file: file.replace(SRC, 'src'),
          line: source.slice(0, at).split('\n').length,
          tag: source.slice(at, end + 1),
        });
        at = source.indexOf('<AsyncBoundary', end + 1);
      }
      return found;
    });
}

/*
 * The scan must actually FIND the boundaries, or every rule below is green over
 * nothing. Asserted rather than assumed, because that is exactly how the first
 * version passed: a census whose subject list is empty agrees with every rule
 * anybody writes.
 */
describe('the census can see what it is censusing', () => {
  /*
   * A CENSUS THAT FINDS NOTHING AGREES WITH EVERY RULE ANYBODY WRITES, so the
   * rules below are worth nothing without these two.
   *
   * ⚠️ THE FIRST VERSION OF THIS GUARD WAS ITSELF VACUOUS, and it is a better
   * lesson than the defect it was written to catch. It floored the count at
   * `> 10` and passed here — but only because of where this app happens to put
   * its props. Truncation blinds a tag only when its ARROW comes before its
   * `errorMessage`; in the admin app that is 7 tags of 43, so a truncating
   * scanner still returns 36 and sails past any floor of 10 or 30. Same guard,
   * same mutation, opposite verdict — decided by prop ORDER rather than by
   * correctness. `crm-6a` measured that and it is why the second assertion
   * exists.
   */
  it('finds the AsyncBoundary call sites, with their props intact', () => {
    const tags = boundaryTags();
    // Floored just under the measured 18, like the coverage and suite floors:
    // an ordinary regression guard, and NOT the proof of correctness — that is
    // the case below.
    expect(tags.length, 'no AsyncBoundary found — every rule below is vacuous').toBeGreaterThan(15);
    expect(
      tags.filter(({ tag }) => /\berrorMessage=/.test(tag)).length,
      'no tag carries errorMessage — the scan is truncating before the props',
    ).toBeGreaterThan(15);
  });

  it('reads past an arrow function to reach the props after it', () => {
    /*
     * THE ORDERING-INDEPENDENT PROOF, and the only one of these two that
     * actually pins the scanner.
     *
     * `onRetry={() => …}` contains a `>`, which is exactly what a
     * `>`-terminated scan mistakes for the end of the tag. So a tag whose
     * onRetry sits BEFORE its errorMessage is the shape a truncating scanner
     * cannot see past — and finding one proves the scan survives an arrow,
     * whatever the ratio happens to be that day. 17 of this app's 18 tags are
     * that shape; admin's are 7 of 43. The assertion holds either way and does
     * not drift as screens are added or removed.
     */
    const arrowBeforeCopy = boundaryTags().filter(({ tag }) => {
      const [beforeCopy] = tag.split('errorMessage=');
      return tag.includes('errorMessage=') && beforeCopy.includes('=>');
    });

    expect(
      arrowBeforeCopy.length,
      'no tag places an arrow function before its errorMessage, so nothing here proves ' +
        'the scanner reads past one. Either the app changed shape or the scan is truncating.',
    ).toBeGreaterThan(0);
  });
});

describe('error copy is resolved by the boundary, never by the screen', () => {
  it('has no call site passing apiErrorMessage into errorMessage', () => {
    const offenders = boundaryTags()
      .filter(({ tag }) => /errorMessage=\{\s*apiErrorMessage\(/.test(tag))
      .map(({ file, line }) => `${file}:${line}`);

    expect(
      offenders,
      'these screens resolve the API message before AsyncBoundary sees it, so their own ' +
        'sentence is dropped by the dedup and never reaches the reader. Pass the plain ' +
        "string — errorMessage={t('x.loadFailed')} — and let the boundary add the API's " +
        'reason beneath it.',
    ).toEqual([]);
  });

  it('has no call site stating a message while withholding the error', () => {
    const offenders = boundaryTags()
      .filter(({ tag }) => /\berrorMessage=/.test(tag) && !/\berror=/.test(tag))
      .map(({ file, line }) => `${file}:${line}`);

    expect(
      offenders,
      "these screens say what failed but pass no `error`, so the API's own reason is " +
        'silently absent — the same defect as rule 1 through the other door. Pass ' +
        'error={query.error} alongside errorMessage.',
    ).toEqual([]);
  });
});
