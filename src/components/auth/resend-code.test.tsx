import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { formatCountdown, ResendCode, secondsUntilResend } from './resend-code';

/**
 * The resend countdown mirrors the SERVER's 30-second cooldown. A button
 * offered sooner would be answered with the ordinary sentence and send nothing,
 * so the client would wait for a code that was never mailed.
 */

const resendVerification = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { auth: { resendVerification } } }));

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

describe('the clock', () => {
  it('counts whole seconds down to zero, never below', () => {
    expect(secondsUntilResend(NOW, NOW)).toBe(30);
    expect(secondsUntilResend(NOW, NOW + 29_001)).toBe(1);
    expect(secondsUntilResend(NOW, NOW + 30_000)).toBe(0);
    expect(secondsUntilResend(NOW, NOW + 120_000)).toBe(0);
    // A send that was never made (sentAt 0) may be asked for at once.
    expect(secondsUntilResend(0, NOW)).toBe(0);
  });

  it('reads as a clock face', () => {
    expect(formatCountdown(22)).toBe('0:22');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('ResendCode', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    resendVerification.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from a fresh send, then offers the button', async () => {
    render(
      <ResendCode email="ada@example.test" sentAt={NOW} onSent={vi.fn()} onFailed={vi.fn()} />,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Resend in 0:30')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(8_000));
    expect(screen.getByText('Resend in 0:22')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(22_000));
    expect(screen.getByRole('button', { name: /send a new code/i })).toBeInTheDocument();
  });

  it('picks up mid-countdown after a reload, from the remembered send time', async () => {
    render(
      <ResendCode
        email="ada@example.test"
        sentAt={NOW - 20_000}
        onSent={vi.fn()}
        onFailed={vi.fn()}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Resend in 0:10')).toBeInTheDocument();
  });

  it('asks the server ONCE however fast it is tapped, and reports when', async () => {
    let settle: (value: unknown) => void = () => undefined;
    resendVerification.mockImplementation(() => new Promise((resolve) => (settle = resolve)));
    const onSent = vi.fn();
    render(<ResendCode email="ada@example.test" sentAt={0} onSent={onSent} onFailed={vi.fn()} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    const button = screen.getByRole('button', { name: /send a new code/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(resendVerification).toHaveBeenCalledTimes(1);
    expect(resendVerification).toHaveBeenCalledWith('ada@example.test');

    await act(async () => {
      settle({ message: 'ok' });
      await Promise.resolve();
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith(NOW);
  });

  it('hands a refusal to the screen rather than swallowing it', async () => {
    const refusal = { response: { status: 429, data: { code: 'RATE_LIMITED' } } };
    resendVerification.mockRejectedValue(refusal);
    const onSent = vi.fn();
    const onFailed = vi.fn();
    render(<ResendCode email="ada@example.test" sentAt={0} onSent={onSent} onFailed={onFailed} />);
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(screen.getByRole('button', { name: /send a new code/i }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(onFailed).toHaveBeenCalledWith(refusal);
    expect(onSent).not.toHaveBeenCalled();
  });

  it('offers nothing while the screen is busy', async () => {
    render(
      <ResendCode
        email="ada@example.test"
        sentAt={0}
        disabled
        onSent={vi.fn()}
        onFailed={vi.fn()}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    const button = screen.getByRole('button', { name: /send a new code/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(resendVerification).not.toHaveBeenCalled();
  });
});
