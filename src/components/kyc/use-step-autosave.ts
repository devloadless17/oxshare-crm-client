'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
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
 * What is saved is exactly what Continue saves, with one difference: a
 * phone number that is not yet a complete number is saved as NOT ANSWERED. The
 * API refuses a half-typed number, and keeping the OLD one on the server while
 * the screen shows a new one is the very disagreement this exists to end.
 */

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface FieldLike {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}

interface StepLike {
  slug: string;
  fields: FieldLike[];
}

/** How long typing has to pause before the answers are saved. */
export const AUTOSAVE_DELAY_MS = 800;

/** The answers autosave sends — see the note above on phone numbers. */
export function autosaveAnswers(
  step: StepLike,
  formData: Record<string, string>,
): Record<string, string> {
  const answers = answersToSave(step, formData);
  for (const field of step.fields) {
    const value = answers[field.name];
    if (field.type === 'phone' && value && !isCompletePhone(value)) answers[field.name] = '';
  }
  return answers;
}

/** The server's copy of the same answers, in the same shape, to compare against. */
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
  const answers = step ? autosaveAnswers(step, formData) : undefined;
  const snapshot = answers ? JSON.stringify(answers) : '';
  const serverSnapshot = answers ? savedShape(answers, saved) : '';

  // Held in refs so the timer and the unmount save send the LATEST answers.
  const pending = useRef<{ slug: string; answers: Record<string, string> } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string>('');
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const send = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
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
  useEffect(() => () => void send(), [step?.slug, send]);

  return { state, flush: send };
}
