import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput } from './phone-input';

/**
 * The phone field shows the number it is GIVEN — including one that arrives
 * after it mounted.
 *
 * Reported from local testing: leave KYC and come back, and every field was
 * filled in again except the phone number. It was saved; the component read its
 * value once, at mount, and the saved answer reached the form a moment later.
 */
describe('PhoneInput', () => {
  it('shows a saved number that arrives after it mounted', () => {
    const { rerender } = render(<PhoneInput aria-label="Phone" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Phone')).toHaveValue('');

    rerender(<PhoneInput aria-label="Phone" value="+961 70777777" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Phone')).toHaveValue('70777777');
    expect(screen.getByRole('button', { name: /\+961/ })).toBeInTheDocument();
  });

  it('does not disturb what the client is typing — its own echo is not an outside change', async () => {
    let value = '';
    const onChange = vi.fn((next: string) => {
      value = next;
    });
    const { rerender } = render(
      <PhoneInput aria-label="Phone" value={value} onChange={onChange} />,
    );

    const input = screen.getByLabelText('Phone');
    for (const key of '70 123') {
      await userEvent.type(input, key);
      rerender(<PhoneInput aria-label="Phone" value={value} onChange={onChange} />);
    }

    expect(input).toHaveValue('70 123');
    expect(value).toBe('+961 70 123');
  });

  it('reads the most specific dial code — +1684 is American Samoa, not +1', () => {
    render(<PhoneInput aria-label="Phone" value="+1684 633 1234" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /\+1684/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveValue('633 1234');
  });
});
