'use client';

import { useEffect, useRef } from 'react';
import { ErrorDetail, errorDetailFor } from '@/components/error-detail';

/**
 * Why Continue did not move on, under the step — and SCROLLED INTO VIEW.
 *
 * The step's own content scrolls, and the alert sits after the last field, so
 * on any step taller than the screen it appeared below the fold: the client
 * pressed Continue, nothing seemed to happen, and the sentence saying which
 * answer was missing was out of sight (found in the Arabic end-to-end test, 3
 * Oct 2026, on a step of eight questions). It is brought into view each time
 * the message changes, CENTRED: `nearest` left it under the sticky Continue bar.
 * `role="alert"` already announces it to a screen reader.
 */
export function StepAlert({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // `?.`: jsdom has no scrollIntoView, and a missing scroll is not worth a crash.
    ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [message]);

  return (
    <div
      ref={ref}
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-semibold text-destructive animate-in fade-in-0"
    >
      {message}
      <ErrorDetail detail={errorDetailFor(message)} />
    </div>
  );
}
