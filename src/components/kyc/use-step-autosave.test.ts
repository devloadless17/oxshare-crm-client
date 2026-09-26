import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearKycDraft, rememberEdit } from '@/lib/kyc-draft';
import {
  AUTOSAVE_DELAY_MS,
  autosaveAnswers,
  continueAnswers,
  useStepAutosave,
} from './use-step-autosave';

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

/**
 * The personal step as the API serves it: the client's identity marked
 * `system` (it is their profile), then a broker's own question.
 */
const PERSONAL = {
  slug: 'personal',
  fields: [
    { name: 'firstName', label: 'First Name', type: 'text', required: true, system: true },
    { name: 'phone', label: 'Phone Number', type: 'phone', required: true, system: true },
    { name: 'customField_job', label: 'Occupation', type: 'text', required: false },
  ],
};
const PERSONAL_SAVED = { firstName: 'Jane', phone: '+961 70 777 777', customField_job: '' };

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  clearKycDraft();
});
afterEach(() => vi.useRealTimers());

function mount(formData: Record<string, string>, ready = true, step: typeof STEP = STEP) {
  const onSaved = vi.fn();
  const saved = step === PERSONAL ? PERSONAL_SAVED : SAVED;
  const hook = renderHook(
    (props: { formData: Record<string, string>; ready: boolean }) =>
      useStepAutosave({
        step,
        formData: props.formData,
        saved,
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

describe('the client’s identity (26 Sep 2026)', () => {
  it('saves what THIS client edited once the typing pauses — never a value they did not touch', async () => {
    // The phone on screen differs from the server's (the desk changed it after
    // this tab loaded), but the client never touched it: echoing it would undo
    // the desk's change. Only the edited name goes — and it goes on the pause,
    // not only on the way out: a page that unloads runs no unmount save, and a
    // cleared phone left on the server was the reported bug.
    rememberEdit('firstName', 'Layla');
    mount(
      { ...PERSONAL_SAVED, firstName: 'Layla', phone: '+961 71 111 111', customField_job: 'Pilot' },
      true,
      PERSONAL,
    );

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/kyc/step', {
      step: 'personal',
      data: { firstName: 'Layla', customField_job: 'Pilot' },
    });
  });

  it('saves a CLEARED identity field the client emptied themselves', async () => {
    rememberEdit('phone', '');
    mount({ ...PERSONAL_SAVED, phone: '' }, true, PERSONAL);
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(post).toHaveBeenCalledWith('/kyc/step', {
      step: 'personal',
      data: { phone: '', customField_job: '' },
    });
  });

  it('sends nothing, now or on the way out, when nothing was edited', async () => {
    const { result } = mount({ ...PERSONAL_SAVED, phone: '+961 71 111 111' }, true, PERSONAL);
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 5));
    await act(async () => void (await result.current.flush()));
    expect(post).not.toHaveBeenCalled();
  });
});

describe('autosaveAnswers', () => {
  it('never saves a half-typed phone — not as blank, not at all', () => {
    // Sent as "not answered", it erased the number on file while the client
    // was still typing the new one (reported).
    expect(autosaveAnswers(STEP, { firstName: 'Jane', phone: '+961 70 12' })).toEqual({
      firstName: 'Jane',
    });
    expect(
      autosaveAnswers(PERSONAL, { ...PERSONAL_SAVED, phone: '+961 70 12' }, new Set(['phone'])),
    ).not.toHaveProperty('phone');
  });

  it('saves an EMPTIED phone as cleared — the bare dial code the picker shows is no number', () => {
    // Held back as "half-typed", the clear never reached the server: the old
    // number stayed on file while this tab showed none (kyc-resume.spec.ts).
    expect(
      autosaveAnswers(PERSONAL, { ...PERSONAL_SAVED, phone: '+961' }, new Set(['phone'])),
    ).toHaveProperty('phone', '');
  });

  it('keeps a complete phone as typed', () => {
    expect(autosaveAnswers(STEP, { firstName: 'Jane', phone: '+961 70 123 456' }).phone).toBe(
      '+961 70 123 456',
    );
  });

  it('sends the client’s identity only where they edited it', () => {
    const form = { firstName: 'Layla', phone: '+961 70 123 456', customField_job: 'Pilot' };
    expect(autosaveAnswers(PERSONAL, form)).toEqual({ customField_job: 'Pilot' });
    expect(autosaveAnswers(PERSONAL, form, new Set(['firstName']))).toEqual({
      firstName: 'Layla',
      customField_job: 'Pilot',
    });
  });
});

describe('continueAnswers', () => {
  it('sends what is on screen — a half-typed phone included, so the server can say what is wrong', () => {
    const form = { firstName: 'Jane', phone: '+961 70 12', customField_job: 'Pilot' };
    expect(continueAnswers(PERSONAL, form, new Set(['phone']))).toEqual({
      phone: '+961 70 12',
      customField_job: 'Pilot',
    });
  });

  it('never echoes identity the client did not edit', () => {
    const form = { firstName: 'Jane', phone: '+961 70 123 456', customField_job: '' };
    expect(continueAnswers(PERSONAL, form, new Set())).toEqual({ customField_job: '' });
  });
});
