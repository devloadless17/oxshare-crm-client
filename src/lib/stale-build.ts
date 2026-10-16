/**
 * A tab still running a previous release.
 *
 * After a release the new container serves only its own chunks, so a tab opened
 * before it fails the moment it lazily loads one (a page it had not visited yet,
 * the assistant panel). Re-rendering cannot recover that, because the file is gone.
 * Only a full reload, which fetches the new build, can.
 * `deploymentId` (next.config.ts) catches it on navigation; this catches the rest.
 */
const STALE_BUILD =
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleBuildError(error: { name?: string; message?: string }): boolean {
  return STALE_BUILD.test(`${error.name ?? ''} ${error.message ?? ''}`);
}

const KEY = 'oxshare-stale-build-reload';
/** One automatic reload per window: a chunk that is STILL missing must not loop. */
const WINDOW_MS = 30_000;

/** Reloads once and returns true, or returns false if it already did so recently. */
export function reloadOnceForStaleBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No storage (private mode): show the screen rather than risk a reload loop.
    return false;
  }
  window.location.reload();
  return true;
}
