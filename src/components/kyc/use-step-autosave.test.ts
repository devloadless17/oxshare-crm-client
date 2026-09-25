import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AUTOSAVE_DELAY_MS, autosaveAnswers, useStepAutosave } from './use-step-autosave';

/**
 * Typed KYC answers are saved as the client types.
 *
 * Reported from local testing: clear the phone number, leave KYC, come back —
 * the server still had the old profile, so the wizard resumed on a later step
 * while the screen showed the cleared phone. What was shown and what was saved
 * had come apart.
 */

const post = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => {
  const api = { post };
  return { api, default: api };
});

const STEP = {
  slug: 'personal',
  fields: [
    { name: 'firstName', label: 'First Name', type: 'text', required: true },
    { name: 'phone', label: 'Phone Number', type: 'phone', required: true },
  ],
};
const SAVED = { firstName: 'Jane', phone: '+961 70 777 777' };

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
  post.mockResolvedValue({ data: {} });
});
afterEach(() => vi.useRealTimers());

function mount(formData: Record<string, string>, ready = true) {
  const onSaved = vi.fn();
  const hook = renderHook(
    (props: { formData: Record<string, string>; ready: boolean }) =>
      useStepAutosave({
        step: STEP,
        formData: props.formData,
        saved: SAVED,
        ready: props.ready,
        onSaved,
      }),
    { initialProps: { formData, ready } },
  );
  return { ...hook, onSaved };
}

describe('autosave', () => {
  it('saves a change once typing pauses — a cleared phone included', async () => {
    const { onSaved } = mount({ firstName: 'Jane', phone: '' });

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));

    expect(post).toHaveBeenCalledWith('/kyc/step', {
      step: 'personal',
      data: { firstName: 'Jane', phone: '' },
    });
    // It says WHAT the server now holds, so the tab's draft can forget it.
    expect(onSaved).toHaveBeenCalledWith({ firstName: 'Jane', phone: '' });
  });

  it('NEVER saves before the form has been filled from the server — an empty form would erase the profile', async () => {
    mount({}, false);
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5));
    expect(post).not.toHaveBeenCalled();
  });

  it('saves nothing when the form already matches what the server holds', async () => {
    mount({ ...SAVED });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5));
    expect(post).not.toHaveBeenCalled();
  });

  it('does not save a change that was undone before the pause ended', async () => {
    const { rerender } = mount({ firstName: 'Janet', phone: SAVED.phone });
    rerender({ formData: { ...SAVED }, ready: true });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5));
    expect(post).not.toHaveBeenCalled();
  });

  it('saves at once when asked — the Back button — and when the step is left', async () => {
    const { result, unmount } = mount({ firstName: 'Janet', phone: SAVED.phone });
    await act(async () => void (await result.current.flush()));
    expect(post).toHaveBeenCalledTimes(1);

    const second = mount({ firstName: 'Jo', phone: SAVED.phone });
    second.unmount();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[1]).toEqual({
      step: 'personal',
      data: { firstName: 'Jo', phone: SAVED.phone },
    });
  });
});

describe('autosaveAnswers', () => {
  it('saves a half-typed phone as NOT ANSWERED — never the old number under a new one', () => {
    expect(autosaveAnswers(STEP, { firstName: 'Jane', phone: '+961 70 12' })).toEqual({
      firstName: 'Jane',
      phone: '',
    });
  });

  it('keeps a complete phone as typed', () => {
    expect(autosaveAnswers(STEP, { firstName: 'Jane', phone: '+961 70 123 456' }).phone).toBe(
      '+961 70 123 456',
    );
  });
});
