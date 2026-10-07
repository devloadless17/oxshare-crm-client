import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '@/test/render';
import { NotificationsSheet } from './notifications-sheet';

/**
 * What an ARRIVAL does — the chime and the toast — and why a burst is one of
 * each. The hourly commission run confirms a partner's rebates together, so a
 * client can be told about twenty credits in the same instant; twenty chimes
 * stacked and twenty toasts cycling are the bell the owner asked not to have.
 */

const { getNotifications, getUnreadCount, markRead, toast, chime, realtime } = vi.hoisted(() => {
  // The socket handlers the bell registered, so a test can play an event in.
  const handlers: Record<string, (payload?: unknown) => void> = {};
  return {
    getNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    toast: vi.fn(),
    chime: vi.fn(),
    realtime: { handlers },
  };
});

vi.mock('@/lib/api/notifications', () => ({
  notificationsApi: {
    getNotifications,
    getUnreadCount,
    markRead,
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
  },
}));
// Only `toast` is observed; the real `Toaster` stays for the render helper.
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast,
}));
vi.mock('@/lib/notification-sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notification-sound')>()),
  playNotificationSound: chime,
}));
vi.mock('@/hooks/use-realtime', () => ({
  useRealtime: (handlers: Record<string, (payload?: unknown) => void>) => {
    Object.assign(realtime.handlers, handlers);
    return { connected: false };
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({
    user: { id: 'u-1', email: 'client@oxshare.com', firstName: 'Kay', emailVerified: true },
    isLoading: false,
  }),
}));

const arrival = (amount: string) => ({
  kind: 'withdrawal.approved',
  params: { transactionId: 't-1', amount, currency: 'USD' },
});

beforeEach(() => {
  vi.clearAllMocks();
  getNotifications.mockResolvedValue({ items: [], nextCursor: null });
  getUnreadCount.mockResolvedValue({ count: 0 });
  markRead.mockResolvedValue({});
});

describe('an arrival', () => {
  it('announces a lone notification in full', async () => {
    renderWithProviders(<NotificationsSheet />);
    realtime.handlers['notification.created']?.(arrival('100.00000000'));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith('Withdrawal approved', expect.anything());
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('makes a burst ONE announcement — one chime, one toast', async () => {
    renderWithProviders(<NotificationsSheet />);
    for (let i = 1; i <= 5; i += 1) {
      realtime.handlers['notification.created']?.(arrival(`${i}.00000000`));
    }

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      '5 new notifications',
      expect.objectContaining({ id: 'notifications-burst' }),
    );
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('following the toast reads it — as a click on its row does', async () => {
    renderWithProviders(<NotificationsSheet />);
    realtime.handlers['notification.created']?.({ ...arrival('100.00000000'), id: 'n-9' });

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    const options = toast.mock.calls[0]?.[1] as { action?: { onClick: () => void } } | undefined;
    options?.action?.onClick();
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('n-9'));
  });

  it('shows no toast while the panel is open — the client is watching it land', async () => {
    renderWithProviders(<NotificationsSheet />);
    await userEvent.click(screen.getByRole('button', { name: /open notifications/i }));
    realtime.handlers['notification.created']?.(arrival('100.00000000'));

    await waitFor(() => expect(chime).toHaveBeenCalledTimes(1));
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('a balance change (backend 0204, 7 Oct 2026)', () => {
  it('refreshes the trading accounts and the dashboard, and announces nothing', async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    renderWithProviders(<NotificationsSheet />);
    await waitFor(() => expect(realtime.handlers['account.balance']).toBeDefined());
    invalidate.mockClear();

    realtime.handlers['account.balance']?.({ accountId: 'acc-1' });

    const refreshed = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(refreshed).toContain(JSON.stringify(['trading-accounts']));
    expect(refreshed).toContain(JSON.stringify(['dashboard']));
    // A balance moving is not a notification: no toast, no chime.
    expect(toast).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });
});
