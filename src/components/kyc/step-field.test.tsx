import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { StepField } from './step-field';

/**
 * Fields a broker can now put on ANY step — asked for in local testing.
 */

const base = {
  isErrored: false,
  selfieUploaded: false,
  uploadsState: {},
  onUpload: vi.fn(),
};

describe('a checkbox WITH choices is "tick all that apply"', () => {
  const funds = {
    id: 'f-funds',
    name: 'funds',
    label: 'Source of funds',
    type: 'checkbox' as const,
    required: true,
    options: ['Salary', 'Savings', 'Gift'],
  };

  it('offers every choice, ticked as answered', () => {
    renderWithProviders(
      <StepField {...base} field={funds} slug="address" val="Gift" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: /source of funds/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Gift' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Salary' })).not.toBeChecked();
  });

  it('answers with the ticked choices in the order the broker listed them', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <StepField {...base} field={funds} slug="address" val="Gift" onChange={onChange} />,
    );
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Salary' }));
    expect(onChange).toHaveBeenCalledWith('funds', 'Salary, Gift');
  });
});

describe('the selfie step holds more than the selfie', () => {
  it('draws a text question there as a text box, not as a second selfie camera', () => {
    const note = {
      id: 'f-note',
      name: 'note',
      label: 'Anything to add?',
      type: 'text' as const,
      required: false,
    };
    renderWithProviders(
      <StepField {...base} field={note} slug="selfie" val="" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/anything to add/i).tagName).toBe('INPUT');
    expect(screen.queryByRole('button', { name: /camera|selfie/i })).not.toBeInTheDocument();
  });
});
