import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import {
  answeredDetails,
  DepositDetailsFields,
  missingDetail,
  type ProofFieldQuestion,
} from './deposit-details-fields';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  apiClient: { post },
  idempotent: (key: string) => ({ headers: { 'Idempotency-Key': key } }),
}));

const PHONE: ProofFieldQuestion = {
  id: 'f_phone00001',
  label: 'Phone number you sent from',
  type: 'phone',
  required: true,
  hint: null,
};
const CODE: ProofFieldQuestion = {
  id: 'f_code000001',
  label: 'Transfer code',
  type: 'text',
  required: false,
  hint: 'On your OMT slip',
};

describe('the details an offline method asks for (backend 0163)', () => {
  it('asks each question in the method’s words, marks the optional one, and reports typing', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DepositDetailsFields fields={[PHONE, CODE]} values={{}} onChange={onChange} />,
    );
    expect(screen.getByText('Transfer code')).toBeInTheDocument();
    expect(screen.getByText('(optional)')).toBeInTheDocument();
    expect(screen.getByText('On your OMT slip')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/transfer code/i), 'Z');
    expect(onChange).toHaveBeenLastCalledWith({ f_code000001: 'Z' });
  });

  it('shows the server’s refusal under the input it belongs to', () => {
    renderWithProviders(
      <DepositDetailsFields
        fields={[CODE]}
        values={{}}
        onChange={() => {}}
        errors={{ f_code000001: 'Transfer code must be at most 120 characters, on one line.' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('at most 120 characters');
  });

  it('counts a phone holding only its dial code as missing, and never sends it', () => {
    expect(missingDetail([PHONE, CODE], { f_phone00001: '+961' })).toBe(PHONE);
    expect(missingDetail([PHONE, CODE], { f_phone00001: '+961 70 123 456' })).toBeUndefined();
    expect(
      answeredDetails([PHONE, CODE], {
        f_phone00001: '+961',
        f_code000001: '  ZX-9981 ',
        f_unknown001: 'not asked',
      }),
    ).toEqual({ f_code000001: 'ZX-9981' });
  });

  it('sends each answer as a details[<id>] part of the offline form', async () => {
    post.mockResolvedValue({ data: {} });
    const { depositsApi } = await import('@/lib/api/deposits');
    await depositsApi.requestOffline(
      { amount: '100', currency: 'USD', method: 'omt' },
      new File(['x'], 'receipt.png', { type: 'image/png' }),
      'key-1',
      { f_phone00001: '+961 70 123 456' },
    );
    const form = post.mock.calls[0]?.[1] as FormData;
    expect(form.get('details[f_phone00001]')).toBe('+961 70 123 456');
    expect(form.get('method')).toBe('omt');
  });
});
