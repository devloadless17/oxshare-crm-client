import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { MoneyAction } from './money-action';

/**
 * The control that stands between an unverified client and a form the API will
 * refuse.
 *
 * `useKycAccess` is stubbed rather than driven through a mocked `/kyc/status`,
 * because what is under test here is the DECISION this component makes with the
 * hook's answer — link or dialog — not the hook's own fetching. The hook's rules
 * are covered by `lib/kyc-access.test.ts`, where they are pure.
 */
const kycAccess = vi.hoisted(() => ({
  approved: false,
  pending: false,
  rejected: false,
  reverification: false,
  isLoading: false,
  status: undefined as string | undefined,
}));

vi.mock('@/hooks/use-kyc-access', () => ({
  useKycAccess: () => kycAccess,
}));

beforeEach(() => {
  Object.assign(kycAccess, {
    approved: false,
    pending: false,
    rejected: false,
    reverification: false,
    isLoading: false,
    status: undefined,
  });
});

describe('when the client is cleared', () => {
  it('is a real link, so it can be middle-clicked', () => {
    kycAccess.approved = true;

    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);

    /*
     * An `<a href>` and not a button. These were `<Link>`s originally and the
     * component was extracted without giving that up — `asChild` keeps the
     * anchor underneath so "open in a new tab" still works.
     */
    const link = screen.getByRole('link', { name: /deposit/i });
    expect(link).toHaveAttribute('href', '/deposit');
  });
});

describe('when the client is not cleared', () => {
  it('offers a way out rather than a dead control', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);

    // Not a link — clicking must not navigate to a form the API refuses.
    expect(screen.queryByRole('link', { name: /deposit/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /deposit/i }));

    /*
     * A dialog, not a disabled button. A greyed-out Deposit answers "can I?"
     * and nothing else; the one thing the client needs — the route to becoming
     * able to — is not on screen.
     */
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /verify/i })).toHaveAttribute('href', '/kyc');
  });

  it('looks identical to the cleared control', () => {
    const { unmount } = renderWithProviders(
      <MoneyAction href="/deposit" icon="deposit" label="Deposit" />,
    );
    const blockedLabel = screen.getByRole('button', { name: /deposit/i }).textContent;
    unmount();

    kycAccess.approved = true;
    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);
    const clearedLabel = screen.getByRole('link', { name: /deposit/i }).textContent;

    /*
     * A control styled differently depending on whether it will work reads as
     * two different features, and the client cannot tell which is the broken
     * one. The appearance says "this is Deposit"; the click says what happens
     * next.
     */
    expect(blockedLabel).toBe(clearedLabel);
  });
});

describe('while the answer is still unknown', () => {
  /**
   * THE asymmetry this component is built around.
   *
   * The two failure modes are not equal. Prompting somebody who turns out to be
   * approved costs one extra click. Letting an unapproved client through lands
   * them on a form the payments API refuses only after they have filled in an
   * amount and a destination.
   *
   * So an unanswered question resolves to "not yet", never to "go ahead" —
   * `!kyc.approved` rather than `isLoading ? … : !approved`. A refactor that
   * treats loading as permissive fails here.
   */
  it('blocks, rather than optimistically linking', () => {
    kycAccess.isLoading = true;
    kycAccess.approved = false;

    renderWithProviders(<MoneyAction href="/withdraw" icon="withdraw" label="Withdraw" />);

    expect(screen.queryByRole('link', { name: /withdraw/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });
});

describe('the dialog explains which state the client is in', () => {
  it('tells a client under review that we are the ones holding it', async () => {
    const user = userEvent.setup();
    kycAccess.pending = true;

    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);
    await user.click(screen.getByRole('button', { name: /deposit/i }));

    /*
     * Sending a submitted client back into the wizard hits `saveStep`'s refusal,
     * which reads as the product having lost their documents. They have done
     * their part; the message has to say so.
     */
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/review/i);
  });

  it('tells a rejected client there is something to correct', async () => {
    const user = userEvent.setup();
    kycAccess.rejected = true;

    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);
    await user.click(screen.getByRole('button', { name: /deposit/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).not.toMatch(/under review/i);
  });

  it('asks a verified client the desk returned to UPDATE — the same shut door, not a refusal', async () => {
    const user = userEvent.setup();
    Object.assign(kycAccess, { rejected: true, reverification: true });

    renderWithProviders(<MoneyAction href="/deposit" icon="deposit" label="Deposit" />);
    await user.click(screen.getByRole('button', { name: /deposit/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/update your verification/i);
    expect(dialog.textContent).toMatch(/paused/i);
    expect(dialog.textContent).not.toMatch(/could not be accepted/i);
  });
});
