import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { NotificationsSheet } from './notifications-sheet';

/**
 * The portal bell, live.
 *
 * Pins the honesty rules the placeholder version existed to protect: the badge
 * draws only from a counted answer (zero/unknown → no badge), an unknown kind
 * renders a generic row rather than a raw slug, money copy goes through
 * formatMoney with no `{placeholder}` residue, and nothing is marked read as a
 * side effect of opening. Mark-all failure lands as an INLINE error line —
 * this app has no toast, deliberately.
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
      expect(screen.getByRole('button', { name: /2 unread/i })).toBeInTheDocument();
    });
  });

  it('draws nothing at zero — the permanent dot stays gone', async () => {
    renderWithProviders(<NotificationsSheet />);
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unread/i })).not.toBeInTheDocument();
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

  it('marks a clicked unread row read — and marks nothing on open', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    getUnreadCount.mockResolvedValue({ count: 1 });
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await screen.findByText('Withdrawal approved');
    expect(markRead).not.toHaveBeenCalled();
    expect(markAllRead).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('link', { name: /withdrawal approved/i }));
    expect(markRead).toHaveBeenCalledWith('n-1');
  });

  it('"Mark all as read" failure renders the INLINE error line', async () => {
    getNotifications.mockResolvedValue(page([notification()]));
    getUnreadCount.mockResolvedValue({ count: 1 });
    markAllRead.mockRejectedValue(new Error('boom'));
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

    await userEvent.click(await screen.findByRole('button', { name: /mark all as read/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows the real empty state — the preview era is over', async () => {
    renderWithProviders(<NotificationsSheet />);
    await openSheet();

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
