import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepAlert } from './step-alert';

/**
 * Why Continue did not move on must be SEEN: on a step taller than the screen
 * the alert sat below the fold and the click looked like it did nothing (Arabic
 * end-to-end test, 3 Oct 2026). It brings itself into view, again for each new
 * message.
 */
describe('StepAlert', () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  afterEach(() => scrollIntoView.mockClear());

  it('scrolls itself into view when it appears, and again when the message changes', () => {
    const { rerender } = render(<StepAlert message="يرجى ملء: اسم جهة العمل" />);
    expect(screen.getByRole('alert')).toHaveTextContent('يرجى ملء: اسم جهة العمل');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });

    rerender(<StepAlert message="يرجى ملء: مصدر الدخل" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    rerender(<StepAlert message="يرجى ملء: مصدر الدخل" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
