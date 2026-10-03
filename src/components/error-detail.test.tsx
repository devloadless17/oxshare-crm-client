import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { FormError } from '@/components/money/money-fields';
import { errorDetailFor, withErrorDetail } from './error-detail';

/**
 * A form keeps its error as a string; the envelope's `detail` rides beside the
 * message it came with, and only that message.
 */
const failure = (detail?: string) => ({
  response: { data: { message: 'Amount too large.', ...(detail ? { detail } : {}) } },
});

describe('the error detail under a form message', () => {
  it('returns the message unchanged and shows its detail, left to right', () => {
    const message = withErrorDetail(failure('max=5000.00 USD'), 'Amount too large.');
    expect(message).toBe('Amount too large.');
    renderWithProviders(<FormError message={message} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Amount too large.');
    expect(screen.getByText('max=5000.00 USD')).toHaveAttribute('dir', 'ltr');
  });

  it('forgets the detail when the same message comes back without one', () => {
    withErrorDetail(failure('max=5000.00 USD'), 'Amount too large.');
    withErrorDetail(failure(), 'Amount too large.');
    expect(errorDetailFor('Amount too large.')).toBeUndefined();
  });

  it('never attaches a detail to a message the form wrote itself', () => {
    renderWithProviders(<FormError message="Enter an amount." />);
    expect(screen.getByRole('alert').querySelector('[dir="ltr"]')).toBeNull();
  });
});
