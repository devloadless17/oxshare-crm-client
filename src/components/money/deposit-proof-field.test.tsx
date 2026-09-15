import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DepositProofField } from './deposit-proof-field';

/*
 * `normaliseDocumentImage` decodes through a canvas, which jsdom does not
 * implement. Stubbed to pass the file through, so these cases are about THIS
 * component's rules — the size refusal and the PDF path — rather than about
 * image decoding, which `image-capture` owns.
 */
vi.mock('@/lib/image-capture', () => ({
  normaliseDocumentImage: (file: File) =>
    Promise.resolve({ file, width: 800, height: 600, wasResized: false, tooSmall: false }),
}));

const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

describe('the deposit receipt field', () => {
  it('refuses a file over the limit and does NOT hand it to the form', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<DepositProofField file={null} onChange={onChange} maxBytes={1024} />);

    await user.upload(
      screen.getByTestId('deposit-proof-input'),
      file('huge.png', 'image/png', 4096),
    );

    /*
     * THE REGRESSION THIS KILLS: dropping the client-side ceiling because "the
     * server checks anyway". It does — but only after the whole file has been
     * uploaded, so a client on a phone watches a 9MB upload finish and then be
     * refused. And `onChange` must stay unfired: a rejected file that still
     * reached the form is a deposit filed with the wrong receipt.
     */
    expect(await screen.findByText(/the limit is 0mb/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts a PDF without sending it through image normalisation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <DepositProofField file={null} onChange={onChange} maxBytes={10 * 1024 * 1024} />,
    );

    const advice = file('advice.pdf', 'application/pdf', 512);
    await user.upload(screen.getByTestId('deposit-proof-input'), advice);

    // Banks issue transfer advices as PDF, and a PDF has no EXIF to rotate and
    // no canvas that can re-encode it. Refusing or mangling one would refuse the
    // best evidence a client can offer.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(advice));
  });
});
