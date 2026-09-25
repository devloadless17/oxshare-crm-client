import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path/posix';

/**
 * NO PORTAL SCREEN SHOWS AN MT5 GROUP (owner, 25 Sep 2026).
 *
 * A group such as `real\Standard-USD` is the broker's internal server path. The
 * client chose a PRODUCT, and the product name is what every screen shows in
 * its place. The API still sends the group, because the open-account request
 * needs it, so nothing stops a screen from printing it except this.
 *
 * Two shapes are refused in screen code (`src/app`, `src/components`):
 *
 * - any read of `mt5Group`, the field the account endpoints carry; and
 * - a JSX expression that is only a `.group` read, like `{type.group}`.
 *
 * Sending the group in a request is fine and is not matched: the open-account
 * dialog reads `chosenType?.group ?? ''` into the payload, never into markup.
 */
const ROOTS = ['src/app', 'src/components'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

/** Comments are prose about groups, which is allowed. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const RENDERED_GROUP = /\{\s*[\w?.!]+\.group\s*\}/;

describe('the MT5 group never reaches a portal screen', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('finds the screens it is checking', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no screen that reads mt5Group or renders a .group', () => {
    const offenders = files.filter((file) => {
      const code = withoutComments(readFileSync(file, 'utf8'));
      return /\bmt5Group\b/.test(code) || RENDERED_GROUP.test(code);
    });

    expect(offenders).toEqual([]);
  });
});
