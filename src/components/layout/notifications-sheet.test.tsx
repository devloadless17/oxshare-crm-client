import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { NotificationsSheet } from './notifications-sheet';

/**
 * The portal bell, live — and done once SEEN (the owner's rule, 25 Sep 2026).
 *
 * Pins the honesty rules the placeholder version existed to protect: the badge
 * draws only from a counted answer (zero/unknown → no badge), an unknown kind
 * renders a generic row rather than a raw slug, and money copy goes through
 * formatMoney with no `{placeholder}` residue.
 *
 * And the seen rule, each part with the regression it stops: nothing is marked
 * while the panel is OPEN (rows would jump from New to Earlier under the
 * reader); closing marks up to the newest row SHOWN, so one that arrived later
 * is never swept; a panel that showed nothing new marks nothing.
 */

const { getNotifications, getUnreadCount, markRead, markAllRead } = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock('@/lib/api/notifications', () => ({
  notificationsApi: { getNotifications, getUnreadCount, markRead, markAllRead },
}));

/*
 * The bell reaches for the app router so a toast raised by an incoming
 * notification can offer a "View" action. `useRouter` throws outside a mounted
 * router ("invariant expected app router to be mounted"), and these tests render
 * the component directly rather than through a route — so it is stubbed.
 *
 * Only `push` is exercised here. The navigation itself belongs to the toast's
 * own coverage; what this file asserts is the sheet, and it must not fail to
 * render because of a dependency it never calls.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

/*
 * The bell does not fetch until the address is proved — both feed routes sit
 * behind the backend's EmailVerifiedGuard. `emailVerified` is mutable so the
 * unverified case can assert the silence.
 */
const session = { emailVerified: true };

vi.mock('@/context/UserContext', () => ({
  useUser: () => ({
    user: {
      id: 'u-1',
      email: 'client@oxshare.com',
      firstName: 'Kay',
      get emailVerified() {
        return session.emailVerified;
      },
    },
    isLoading: false,
  }),
}));

const notification = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'withdrawal.approved',
  params: { transactionId: 't-1', amount: '100.00000000', currency: 'USD' },
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
});

const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });

beforeEach(() => {
  vi.clearAllMocks();
  session.emailVerified = true;
  getNotifications.mockResolvedValue(page([]));
  getUnreadCount.mockResolvedValue({ count: 0 });
  markRead.mockResolvedValue(notification({ readAt: new Date().toISOString() }));
  markAllRead.mockResolvedValue({ updated: 0 });
});

async function openSheet() {
  await userEvent.click(screen.getByRole('button', { name: /open notifications/i }));
}

describe('the badge', () => {
  it('shows the unread count, and no badge at zero', async () => {
    getUnreadCount.mockResolvedValue({ count: 2 });
    renderWithProviders(<NotificationsSheet />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /2 new/i })).toBeInTheDocument();
    });
  });

  it('draws nothing at zero — the permanent dot stays gone', async () => {
    renderWithProviders(<NotificationsSheet />);
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\d+ new/i })).not.toBeInTheDocument();
  });
});

describe('the list', () => {
  it('renders a known kind with formatted money and no placeholder residue', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText('Withdrawal approved')).toBeInTheDocument();
    const body = screen.getByText(/was approved and is being processed/i);
    expect(body.textContent).toContain('100');
    expect(body.textContent).not.toContain('{');
  });

  it('renders an unknown kind as a generic row, never a raw slug', async () => {
    getNotifications.mockResolvedValue(
      page([notification({ id: 'n-x', kind: 'future.event', params: {} })]),
    );
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText('Notification')).toBeInTheDocument();
    expect(screen.queryByText('future.event')).not.toBeInTheDocument();
  });

  it('splits NEW from EARLIER by the read marker', async () => {
    getNotifications.mockResolvedValue(
      page([
        notification({ id: 'n-new' }),
        notification({
          id: 'n-old',
          kind: 'kyc.approved',
          params: {},
          readAt: new Date().toISOString(),
        }),
      ]),
    );
    getUnreadCount.mockResolvedValue({ count: 1 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByRole('tab', { name: 'New (1)' })).toBeInTheDocument();
    expect(screen.getByText('Withdrawal approved')).toBeInTheDocument();
    expect(screen.queryByText(/identity verified|kyc approved/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Earlier' }));
    expect(await screen.findByText('Identity verified')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawal approved')).not.toBeInTheDocument();
  });

  it('marks nothing while OPEN, and on close marks up to the newest row SHOWN', async () => {
    const newest = new Date(Date.now() - 60_000).toISOString();
    getNotifications.mockResolvedValue(
      page([
        notification({ id: 'n-2', createdAt: newest }),
        notification({ id: 'n-1', createdAt: new Date(Date.now() - 600_000).toISOString() }),
      ]),
    );
    getUnreadCount.mockResolvedValue({ count: 2 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();
    await screen.findByRole('tab', { name: 'New (2)' });

    // Open: the rows are being read — nothing moves, nothing is marked.
    expect(markAllRead).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    // Closed: seen, up to the newest row on screen — never "now", so a
    // notification that landed after the list rendered stays new.
    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith(newest));
  });

  it('closing a panel that showed nothing new marks nothing', async () => {
    getNotifications.mockResolvedValue(page([notification({ readAt: new Date().toISOString() })]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();
    await screen.findByText("You're all caught up");

    await userEvent.keyboard('{Escape}');
    // Nothing was new, so there is nothing to mark — not an empty POST.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(markAllRead).not.toHaveBeenCalled();
  });

  it('opening a row closes the sheet, which marks what was shown', async () => {
    const newest = new Date(Date.now() - 120_000).toISOString();
    getNotifications.mockResolvedValue(page([notification({ createdAt: newest })]));
    getUnreadCount.mockResolvedValue({ count: 1 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await userEvent.click(await screen.findByRole('link', { name: /withdrawal approved/i }));
    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith(newest));
  });

  it('says "all caught up" when nothing is new, with the way to what came before', async () => {
    getNotifications.mockResolvedValue(page([notification({ readAt: new Date().toISOString() })]));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /see earlier notifications/i }));
    expect(await screen.findByText('Withdrawal approved')).toBeInTheDocument();
  });

  it('shows the real empty state — the preview era is over', async () => {
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    // Nothing new, and nothing before either.
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Earlier' }));
    expect(await screen.findByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByText(/not live yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sample/i)).not.toBeInTheDocument();
  });

  it('asks for NOTHING while the email is unverified — both routes are guarded', async () => {
    // Polling a guaranteed 403 every sixty seconds and then telling a client
    // they may not read their own notifications is worse than not asking.
    session.emailVerified = false;
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    // Not a spinner and not "Nothing yet" — an honest, actionable state.
    expect(await screen.findByText('Verify your email first')).toBeInTheDocument();
    expect(getUnreadCount).not.toHaveBeenCalled();
    expect(getNotifications).not.toHaveBeenCalled();
  });

  it('a 404 renders BackendPending, never sample rows', async () => {
    getNotifications.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    // The portal's BackendPending deliberately does not print endpoint names —
    // client-facing copy. "Not available yet" is its heading.
    expect(await screen.findByText('Not available yet')).toBeInTheDocument();
  });
});
