import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeInput, extractCode } from './code-input';

/**
 * The code box is ONE input drawn as six — so the things a person actually does
 * with a code (type it, paste the subject line, accept the phone's autofill)
 * all arrive as one value and are cleaned by one rule.
 */

describe('extractCode', () => {
  it.each([
    ['482913', '482913'],
    ['482 913', '482913'],
    ['482-913', '482913'],
    [' 482913\n', '482913'],
    ['482913 is your OxShare verification code', '482913'],
    ['Your code is 482913. It expires in 15 minutes.', '482913'],
    // The date in front must not win over the standalone code.
    ['25/09/2026 — code 482913', '482913'],
    ['Code: 48 29 13', '482913'],
    ['007341', '007341'],
  ])('reads %j as %j', (text, code) => {
    expect(extractCode(text)).toBe(code);
  });

  it('keeps a partial code partial, and caps a run of digits at six', () => {
    expect(extractCode('48 29')).toBe('4829');
    expect(extractCode('12345678')).toBe('123456');
    expect(extractCode('no digits here')).toBe('');
  });
});

/** A controlled harness, as the page holds the value. */
function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = React.useState('');
  return (
    <>
      <label htmlFor="code">Verification code</label>
      <CodeInput id="code" value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const field = () => screen.getByLabelText('Verification code');
const current = () => screen.getByTestId('value').textContent;

describe('CodeInput', () => {
  it('is one input a phone can autofill, not six', () => {
    render(<Harness />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field()).toHaveAttribute('inputmode', 'numeric');
  });

  it('takes digits, ignores anything else, and stops at six', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '1a2 3-4567890');
    expect(current()).toBe('123456');
  });

  it('calls onComplete ONCE, with the code, when the sixth digit arrives', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<Harness onComplete={onComplete} />);
    await user.type(field(), '12345');
    expect(onComplete).not.toHaveBeenCalled();
    await user.type(field(), '67');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('takes a pasted subject line whole, and completes', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(field(), {
      clipboardData: { getData: () => '482913 is your OxShare verification code' },
    });
    expect(current()).toBe('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('continues a partial code from a pasted fragment', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '12');
    fireEvent.paste(field(), { clipboardData: { getData: () => '3 4' } });
    expect(current()).toBe('1234');
  });

  it('ignores a paste with no digits in it, leaving what was typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '12');
    fireEvent.paste(field(), { clipboardData: { getData: () => 'hello' } });
    expect(current()).toBe('12');
  });

  it('accepts an autofill that arrives as one change, formatting and all', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.change(field(), { target: { value: '482 913' } });
    expect(current()).toBe('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('corrects with Backspace', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), '123{Backspace}4');
    expect(current()).toBe('124');
  });
});
