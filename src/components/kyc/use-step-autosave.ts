'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { readPersonalDraft } from '@/lib/kyc-draft';
import { answersToSave, isCompletePhone } from './custom-step';

/**
 * Saves the step's typed answers AS THE CLIENT TYPES — so what is on screen
 * is what is saved.
 *
 * ## Reported from local testing: "as if it is not being saved solidly"
 *
 * A step's answers reached the server only on Continue. Go back to the profile,
 * clear the phone number, leave KYC — the SERVER still held the old, complete
 * profile, so coming back resumed on a later step, while the screen showed the
 * cleared phone from this tab's draft. What was shown and what was saved had
 * quietly come apart, and a submission from there would have sent the number
 * the client had removed.
 *
 * Now a change is saved a moment after the typing stops, and at once when the
 * client presses Back or leaves the step. Continue still validates and saves
 * as before; this only makes sure nothing typed is left behind on the way.
 *
 * ## What a save may send (26 Sep 2026)
 *
 * The client's IDENTITY — the fields the API marks `system` — is the profile,
 * shared with the support desk and a reviewer's corrections. So:
 *
 *  - an identity field is sent only if THIS client edited it (it is in the
 *    tab's draft). An open tab echoing a value it loaded an hour ago would undo
 *    a correction the desk made since;
 *  - an edited one is saved like any answer, once the typing pauses. It was
 *    held back until the client LEFT the step, to spare the audit log a row per
 *    pause — and that brought the reported bug straight back: a client who
 *    cleared their phone and left by the address bar, a refresh or a closed tab
 *    left the old number on the server (a page unloading runs no unmount save)
 *    while this tab's draft showed it cleared. `kyc-resume.spec.ts` drives it;
 *  - a phone with digits that do not yet make a number is never autosaved.
 *    Sending it as "not answered" erased the number on file while the client
 *    was still typing the new one (reported). No digits at all — an emptied
 *    field, which the picker shows as its bare dial code — is not half-typed:
 *    it is a cleared phone, and saved as one. Continue sends what is on screen,
 *    and the server says what is wrong with it.
 */
export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface FieldLike {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  /** The platform's identity field — see the header. */
  system?: boolean;
}

interface StepLike {
  slug: string;
  fields: FieldLike[];
}

/** How long typing has to pause before the answers are saved. */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * What an autosave sends from the step's form — see the header for each rule:
 * the client's identity only where `edited` names it, and never a phone that is
 * not yet a number.
 */
export function autosaveAnswers(
  step: StepLike,
  formData: Record<string, string>,
  edited: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const answers = answersToSave(step, formData);
  for (const field of step.fields) {
    if (!(field.name in answers)) continue;
    if (field.system && !edited.has(field.name)) {
      delete answers[field.name];
      continue;
    }
    // Judged on the ANSWER, where a bare dial code is already "no number": a
    // client who emptied the digits cleared their phone, and that is saved.
    const answer = answers[field.name] ?? '';
    if (field.type === 'phone' && answer !== '' && !isCompletePhone(answer)) {
      delete answers[field.name];
    }
  }
  return answers;
}

/**
 * What Continue sends: everything on screen — a half-typed phone included, so
 * the server can say what is wrong with it — but the client's identity only
 * where THEY edited it, for the same reason as a save on the way out.
 */
export function continueAnswers(
  step: StepLike,
  formData: Record<string, string>,
  edited: ReadonlySet<string>,
): Record<string, string> {
  const answers = answersToSave(step, formData);
  for (const field of step.fields) {
    if (field.system && !edited.has(field.name)) delete answers[field.name];
  }
  return answers;
}

function editedKeys(): ReadonlySet<string> {
  return new Set(Object.keys(readPersonalDraft()));
}

function savedShape(answers: Record<string, string>, saved: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(answers).map((k) => [k, saved[k] ?? ''])));
}

export function useStepAutosave({
  step,
  formData,
  saved,
  ready,
  onSaved,
}: {
  /** The step to save; `undefined` for the review screen, which collects nothing. */
  step: StepLike | undefined;
  formData: Record<string, string>;
  /** What the server holds for this step now. */
  saved: Record<string, string>;
  /**
   * The form has been filled from the server. Before that it is EMPTY, and an
   * empty form saved over a complete profile would erase it — so nothing is
   * saved until the form holds what the client actually has.
   */
  ready: boolean;
  /** Told what the server now holds, so the draft can forget it (`kyc-draft.ts`). */
  onSaved: (saved: Record<string, string>) => void;
}): { state: AutosaveState; flush: () => Promise<void> } {
  const [state, setState] = useState<AutosaveState>('idle');
  // The draft is what this client edited (`kyc-draft.ts`); read per render,
  // because every edit writes it before the render it causes.
  const answers = step ? autosaveAnswers(step, formData, editedKeys()) : undefined;
  const snapshot = answers ? JSON.stringify(answers) : '';
  const serverSnapshot = answers ? savedShape(answers, saved) : '';
  // The latest form, for a save on the way OUT that nothing is waiting to send.
  const latest = useRef({ step, formData, saved, ready });
  useEffect(() => {
    latest.current = { step, formData, saved, ready };
  });

  // Held in refs so the timer and the unmount save send the LATEST answers.
  const pending = useRef<{ slug: string; answers: Record<string, string> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string>('');
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const send = useCallback(async (leaving = false) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    let next = pending.current;
    const now = latest.current;
    if (leaving && now.step && now.ready) {
      // Leaving the step: whatever differs from the server goes now, not after a pause.
      const all = autosaveAnswers(now.step, now.formData, editedKeys());
      const shape = JSON.stringify(all);
      if (shape !== savedShape(all, now.saved) && shape !== lastSent.current) {
        next = { slug: now.step.slug, answers: all };
      }
    }
    if (!next) return;
    pending.current = null;
    setState('saving');
    try {
      await api.post('/kyc/step', { step: next.slug, data: next.answers });
      lastSent.current = JSON.stringify(next.answers);
      setState('saved');
      onSavedRef.current(next.answers);
    } catch {
      // Not alarming: the answers are still on screen and in this tab's draft,
      // the next change tries again, and Continue reports anything real.
      setState('failed');
    }
  }, []);

  useEffect(() => {
    if (!step || !answers || !ready) return;
    // Nothing new — what the server holds, or what was just sent. And nothing
    // still waiting from a moment ago: a change typed and then undone must not
    // be saved after all.
    if (snapshot === serverSnapshot || snapshot === lastSent.current) {
      pending.current = null;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      return;
    }
    pending.current = { slug: step.slug, answers };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(), AUTOSAVE_DELAY_MS);
    // `answers` is derived from `snapshot`, which is what this keys on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, serverSnapshot, step?.slug, ready, send]);

  // Leaving the step — Back, a link, closing the wizard — saves what is waiting.
  useEffect(() => () => void send(true), [step?.slug, send]);

  return { state, flush: () => send(true) };
}
