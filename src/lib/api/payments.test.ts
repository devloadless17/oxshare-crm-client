import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The withdrawal request, asserted at the AXIOS boundary — R-5.2.
 *
 * This file exists because of the shape of the bug it pins. `POST
 * /payments/withdrawals` declares `Idempotency-Key` as a required header, and
 * the server rejects a request without one outright. The portal did not send
 * it, so every withdrawal a client requested answered 400 — the only
 * money-moving action a customer has, broken.
 *
 * The screen test could not see it. It mocks `paymentsApi` wholesale, so the
 * mock accepted any call shape and the missing header was invisible. The lesson
 * generalises: when the defect lives in HOW a module calls the network, the
 * test has to stand below that module, not above it.
 */

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return { ...actual, apiClient: { post, get } };
});

const BODY = {
  amount: '123.45678901',
  currency: 'USD' as const,
  destination: 'IBAN-TEST-1',
  provider: 'whish' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { id: 'tx1', state: 'pending' } });
});

describe('requestWithdrawal', () => {
  it('sends the Idempotency-Key the caller supplied', async () => {
    const { paymentsApi } = await import('./payments');
    await paymentsApi.requestWithdrawal(BODY, 'intent-key-1');

    expect(post).toHaveBeenCalledWith('/payments/withdrawals', BODY, {
      headers: { 'Idempotency-Key': 'intent-key-1' },
    });
  });

  it("sends the caller's key verbatim rather than minting its own", async () => {
    // The key names the user's INTENT, so two attempts at one withdrawal must
    // carry the SAME value — that is what lets the server collapse a
    // double-click into one operation. A key generated inside this function
    // would be fresh each call, making every duplicate look like a new
    // withdrawal: the precise bug the header exists to prevent.
    const { paymentsApi } = await import('./payments');

    await paymentsApi.requestWithdrawal(BODY, 'intent-key-2');
    await paymentsApi.requestWithdrawal(BODY, 'intent-key-2');

    const keys = post.mock.calls.map(
      (call) => (call[2] as { headers: Record<string, string> }).headers['Idempotency-Key'],
    );
    expect(keys).toEqual(['intent-key-2', 'intent-key-2']);
  });

  it('keeps the amount a string all the way to the request body', async () => {
    const { paymentsApi } = await import('./payments');
    await paymentsApi.requestWithdrawal(BODY, 'intent-key-3');

    const [, body] = post.mock.calls[0] as [string, { amount: unknown }];
    expect(typeof body.amount).toBe('string');
    expect(body.amount).toBe('123.45678901');
  });
});

/**
 * Email verification is a POST — R-3.9.
 *
 * The API used to do the work on a GET, so anything that follows a link without
 * a person deciding to — a corporate mail gateway, a link scanner, a preview
 * pane — verified the address silently. That is the one thing the email exists
 * to prove.
 */
describe('verifyEmail', () => {
  it('POSTs the token in a body rather than a query string', async () => {
    const { authApi } = await import('./auth');
    await authApi.verifyEmail('tok-123');

    expect(post).toHaveBeenCalledWith('/auth/verify-email', { token: 'tok-123' });
    // A token in the query string reaches access logs, Referer headers and
    // browser history — none of which this app controls.
    expect(get).not.toHaveBeenCalled();
  });
});
