import Decimal from 'decimal.js';
import { expect, test } from './fixtures';
import { adminApiSession, E2E_CLIENT, STORAGE_STATE } from './helpers';

/**
 * "Use max" must offer an amount the server will actually accept.
 *
 * ## The regression this exists to prevent
 *
 * The API refuses a withdrawal carrying more decimal places than the currency
 * declares (D-77) — the fix for silent sub-cent dust, where 50.123456789 was
 * debited in full and paid as 50.12 with the difference kept.
 *
 * A wallet, though, can legitimately HOLD sub-cent value: balances are
 * NUMERIC(28,8) and commission and rebates are percentages, so a partner's
 * balance routinely lands somewhere like 100.12345678. Filling the button with
 * the raw available balance therefore produces "the server refusal the client
 * cannot explain" — on the single action a client most wants, and only for the
 * clients who earn commission, which is the worst possible sample to break.
 *
 * `money.test.ts` pins `floorToScale` itself. What only a browser can answer is
 * whether the BUTTON is wired to it — and the failure is quiet: the page looks
 * perfect, the number looks like money, and it is refused on submit.
 *
 * So this gives the client a real sub-cent balance and drives the actual button.
 */

test.use({ storageState: STORAGE_STATE });

test.describe('the "use max" button on a sub-cent balance', () => {
  test('offers a withdrawable amount, and the server takes it', async ({ page }) => {
    const admin = await adminApiSession();

    // Find the signed-in client, then leave real sub-cent value in their wallet
    // exactly as a percentage-based commission accrual would.
    // `q`, not `search` — the desk's own query parameter.
    const list = await admin.get(
      `/admin/clients?q=${encodeURIComponent(E2E_CLIENT.email)}&limit=5&page=1`,
    );
    expect(list.ok(), 'the desk must find the e2e client').toBe(true);
    const clients = ((await list.json()) as { items: { id: string; email: string }[] }).items;
    const client = clients.find((c) => c.email === E2E_CLIENT.email);
    expect(client, `no client row for ${E2E_CLIENT.email}`).toBeTruthy();

    const credit = await admin.post(
      '/admin/wallets/credit',
      {
        userId: client!.id,
        currency: 'USD',
        // Eight places, none of them trailing zeros — the shape a 30%-of-revenue
        // accrual leaves and the one the precision rule refuses.
        amount: '10.12345678',
        reason: 'e2e: sub-cent balance for the use-max precision check',
      },
      { 'idempotency-key': `use-max-credit-${Date.now()}` },
    );
    expect(credit.ok(), 'the sub-cent credit must land').toBe(true);

    await page.goto('/withdraw');
    await page.waitForLoadState('networkidle');

    /*
     * Walk forward until the amount step, WITHOUT asserting a layout.
     *
     * The first step's heading depends on the account: a client holding one
     * wallet never sees "Which wallet?" at all and lands on "Withdraw with".
     * Pinning either makes this spec fail for a reason that has nothing to do
     * with precision — so it advances on the CONTROL it needs rather than on
     * the screen it expects.
     *
     * Bounded and re-clicked because a click against an unhydrated page
     * silently does nothing, which would otherwise surface as a missing button.
     */
    const useMax = page.getByRole('button', { name: /use max/i }).first();
    const advance = page.getByRole('button', { name: /continue/i }).first();
    for (let step = 0; step < 3; step += 1) {
      if (await useMax.isVisible().catch(() => false)) break;
      if (await advance.isVisible().catch(() => false)) await advance.click();
      await page.waitForTimeout(500);
    }

    await expect(useMax, 'the withdraw screen must offer a "use max"').toBeVisible({
      timeout: 20_000,
    });
    await useMax.click();

    const amount = page.locator('input[inputmode="decimal"]').first();
    const filled = await amount.inputValue();

    /*
     * The assertion, and it is about the VALUE rather than about a request:
     * whatever the button put there must be expressible in the currency. A raw
     * NUMERIC(28,8) balance is not.
     */
    expect(filled, 'the button filled nothing').not.toBe('');
    const places = (filled.split('.')[1] ?? '').length;
    expect(places, `"use max" offered ${filled}, which USD cannot express`).toBeLessThanOrEqual(2);

    /*
     * And it must not be MORE than the client holds — flooring, not rounding.
     * A test that only counted decimals would pass just as happily on a value
     * rounded UP, which trades a precision refusal for a balance one.
     */
    const wallets = await admin.get(`/admin/wallets?userId=${client!.id}&limit=100&page=1`);
    const usd = (
      (await wallets.json()) as { items: { currency: string; balance: string; onHold: string }[] }
    ).items.find((w) => w.currency === 'USD');
    expect(usd, 'the client must hold a USD wallet').toBeTruthy();

    // The desk reports `balance` and `onHold`; available is the difference.
    // decimal.js, not `Number()` — these are NUMERIC(28,8) strings, and
    // coercing one is a lint error everywhere else on this money path.
    const available = new Decimal(usd!.balance).minus(usd!.onHold);
    expect(
      new Decimal(filled).lessThanOrEqualTo(available),
      `"use max" offered ${filled} against an available ${available.toFixed()}`,
    ).toBe(true);

    // And the balance really did carry sub-cent value, or this proved nothing:
    // flooring a figure that was already 2dp is not a test of flooring.
    expect(available.decimalPlaces(), `available was ${available.toFixed()}`).toBeGreaterThan(2);
  });
});
