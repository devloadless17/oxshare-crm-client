import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { setActiveLocale } from '@/lib/i18n';
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

/**
 * ARABIC IS SHOWN, THE ENGLISH OPTION IS SUBMITTED (0179). `optionsAr` is keyed
 * by the English value: the reader sees and picks the Arabic, and the answer
 * saved is the English the server validates and the reviewer reads.
 */
describe('in Arabic', () => {
  beforeEach(() => setActiveLocale('ar'));
  afterEach(() => setActiveLocale('en'));

  const country = {
    id: 'f-country',
    name: 'country',
    label: 'Country of residence',
    labelAr: 'بلد الإقامة',
    type: 'select' as const,
    required: true,
    options: ['Lebanon', 'United Arab Emirates'],
    optionsAr: { Lebanon: 'لبنان', 'United Arab Emirates': 'الإمارات العربية المتحدة' },
  };

  it('labels the question and lists the choices in Arabic, sorted by the Arabic', async () => {
    renderWithProviders(
      <StepField {...base} field={country} slug="personal" val="" onChange={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByRole('combobox', { name: /بلد الإقامة/ }));
    const shown = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(shown).toEqual(['الإمارات العربية المتحدة', 'لبنان']);
  });

  it('answers with the ENGLISH value of the Arabic choice', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <StepField {...base} field={country} slug="personal" val="" onChange={onChange} />,
    );
    await user.click(screen.getByRole('combobox', { name: /بلد الإقامة/ }));
    await user.click(await screen.findByRole('option', { name: 'لبنان' }));
    expect(onChange).toHaveBeenCalledWith('country', 'Lebanon');
  });

  it('shows a saved English answer as its Arabic', () => {
    renderWithProviders(
      <StepField {...base} field={country} slug="personal" val="Lebanon" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: /بلد الإقامة/ })).toHaveTextContent('لبنان');
  });

  it('ticks Arabic checkbox choices and saves the English ones', async () => {
    const onChange = vi.fn();
    const funds = {
      id: 'f-funds',
      name: 'funds',
      label: 'Source of funds',
      labelAr: 'مصدر الأموال',
      type: 'checkbox' as const,
      required: true,
      options: ['Salary', 'Savings'],
      optionsAr: { Salary: 'الراتب', Savings: 'المدخرات' },
    };
    renderWithProviders(
      <StepField {...base} field={funds} slug="address" val="Savings" onChange={onChange} />,
    );
    expect(screen.getByRole('group', { name: /مصدر الأموال/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'المدخرات' })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'الراتب' }));
    expect(onChange).toHaveBeenCalledWith('funds', 'Salary, Savings');
  });

  it('falls back to the English where no Arabic was written', () => {
    const note = {
      id: 'f-note',
      name: 'note',
      label: 'Anything to add?',
      labelAr: '  ',
      type: 'text' as const,
      required: false,
    };
    renderWithProviders(
      <StepField {...base} field={note} slug="address" val="" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText(/anything to add/i)).toBeInTheDocument();
  });
});

describe('a hint reaches the client on every input type', () => {
  it.each(['date', 'phone', 'select', 'checkbox'] as const)('shows the hint on a %s', (type) => {
    const field = {
      id: `f-${type}`,
      name: `q_${type}`,
      label: 'Question',
      hint: 'As printed on your contract',
      type,
      required: false,
      ...(type === 'select' ? { options: ['A', 'B'] } : {}),
    };
    renderWithProviders(
      <StepField {...base} field={field} slug="address" val="" onChange={vi.fn()} />,
    );
    expect(screen.getByText('As printed on your contract')).toBeInTheDocument();
  });

  it("titles a broker's own camera question with its label and hint", () => {
    const field = {
      id: 'f-cam',
      name: 'q_cam',
      label: 'Photo of your card',
      hint: 'Hold it next to your face',
      type: 'camera' as const,
      required: true,
    };
    renderWithProviders(
      <StepField {...base} field={field} slug="address" val="" onChange={vi.fn()} />,
    );
    expect(screen.getByText('Photo of your card')).toBeInTheDocument();
    expect(screen.getByText('Hold it next to your face')).toBeInTheDocument();
  });
});
