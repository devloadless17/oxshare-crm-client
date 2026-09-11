import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRow } from './sessions-list';
import { accountApi, type Session } from '@/lib/api/account';

/**
 * A SIGN-OUT HAS TWO WAYS TO GO WRONG, AND THEY ARE OPPOSITE FACTS.
 *
 * The DELETE failing means the session is still live and trying again is right.
 * The DELETE succeeding while the list refresh fails means the session IS gone
 * and trying again is pointless — telling that client "could not sign that
 * session out" reports the reverse of what happened.
 *
 * Both were one branch until now, and the second was invisible: `onRevoked()`
 * was fired un-awaited behind a `void`, so a failed refresh left the revoked row
 * on screen looking live with nothing said.
 *
 * ⚠️ AND THE FIRST FIX FOR IT WAS DEAD CODE. `useResource.refetch` is
 * `query.refetch()`, which React Query RESOLVES with a result object when the
 * fetch fails rather than rejecting — so `try { await onRevoked() } catch` could
 * never run. It was written, it type-checked, it read as handling, and it
 * handled nothing. Found by mutating the endpoint and watching the spec pass.
 *
 * Which is why this file drives the branches directly rather than through the
 * list: a branch nobody has watched fire is not known to work.
 */
const session: Session = {
  id: 'fam-1',
  current: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  lastActiveAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-10-01T10:00:00.000Z',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
  ip: '203.0.113.7',
};

const ok = () => Promise.resolve({ isError: false });

describe('signing another device out', () => {
  it('reports the REFUSAL when the sign-out itself fails', async () => {
    /*
     * The error carries a message, so `apiErrorMessage` shows THAT rather than
     * the fallback sentence — which is exactly how the matching e2e assertion
     * was wrong the first time. So this asserts the DISTINCTION, not one
     * particular sentence: whatever the row says, it must not be the "signed
     * out, list stale" claim, because the session is still live.
     */
    vi.spyOn(accountApi, 'revokeSession').mockRejectedValueOnce(new Error('the API said no'));
    render(<SessionRow session={session} onRevoked={ok} />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/the API said no/i);
    expect(alert).not.toHaveTextContent(/signed out/i);
  });

  it('falls back to its own sentence when the failure carries no message', async () => {
    vi.spyOn(accountApi, 'revokeSession').mockRejectedValueOnce(new Error(''));
    render(<SessionRow session={session} onRevoked={ok} />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign that session out/i);
  });

  it('says the list is STALE when the sign-out worked and the refresh did not', async () => {
    /*
     * The case that was unreachable twice: once because the refetch was not
     * awaited at all, and once because it was awaited in a `catch` that a
     * resolving promise can never reach.
     */
    vi.spyOn(accountApi, 'revokeSession').mockResolvedValueOnce(undefined as never);
    render(<SessionRow session={session} onRevoked={() => Promise.resolve({ isError: true })} />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/signed out/i);
    // The control: it must NOT claim the sign-out failed, which is the opposite
    // of what happened and is what the single-branch version said.
    expect(alert).not.toHaveTextContent(/could not sign that session out/i);
  });

  it('says nothing at all when both steps succeed', async () => {
    vi.spyOn(accountApi, 'revokeSession').mockResolvedValueOnce(undefined as never);
    render(<SessionRow session={session} onRevoked={ok} />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
