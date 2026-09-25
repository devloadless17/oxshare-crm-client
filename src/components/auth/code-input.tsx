'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Digits in an emailed verification code — the backend's `EMAIL_CODE_LENGTH`. */
export const CODE_LENGTH = 6;

/**
 * The code inside whatever was pasted, dropped or autofilled.
 *
 * People paste the whole subject line ("482913 is your OxShare verification
 * code"), a sentence from the body, or the digits with spaces a mail app put
 * between them. A standalone run of exactly six digits wins; failing that, the
 * digits are taken in order. Never a lookbehind — Safari only learned those in
 * 16.4, and this is the screen a new client on an older phone meets first.
 */
export function extractCode(text: string): string {
  const standalone = /(^|\D)(\d{6})(?!\d)/.exec(text)?.[2];
  if (standalone) return standalone;
  return text.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

interface CodeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once when the sixth digit arrives by typing, pasting or autofill. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  'aria-describedby'?: string;
}

/**
 * Six boxes on screen, ONE real input underneath.
 *
 * Six separate inputs is the obvious build and it breaks the three things that
 * matter most on this screen: a phone's "code from Mail" suggestion fills ONE
 * field, a paste lands in whichever box has focus, and a screen reader announces
 * six unlabelled one-character fields. One `autocomplete="one-time-code"` input
 * does all three natively; the boxes are only how it is drawn.
 *
 * The input covers the boxes, transparent, so a tap anywhere focuses it. Its
 * caret is kept at the end: a code is typed forwards and corrected with
 * Backspace, and a caret parked mid-code in an invisible field is a caret
 * nobody can see.
 *
 * `text-base` on the invisible input is load-bearing — iOS zooms the page on
 * focus into any field set smaller than 16px, and it would do it here with
 * nothing visible to explain the jump.
 */
export const CodeInput = React.forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  {
    id,
    value,
    onChange,
    onComplete,
    disabled = false,
    invalid = false,
    autoFocus = false,
    'aria-describedby': describedBy,
  },
  ref,
) {
  const [focused, setFocused] = React.useState(false);

  const commit = (next: string) => {
    if (next === value) return;
    onChange(next);
    if (next.length === CODE_LENGTH) onComplete?.(next);
  };

  const keepCaretAtEnd = (input: HTMLInputElement) => {
    const end = input.value.length;
    if (input.selectionStart !== end || input.selectionEnd !== end) {
      input.setSelectionRange(end, end);
    }
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        name="one-time-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        // A password manager's icon has no business inside a code field.
        data-1p-ignore
        data-lpignore="true"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          // One typed digit arrives as the whole new value; anything else —
          // an autofill, a drop, a keyboard that inserts a run — is extracted.
          commit(/^\d*$/.test(raw) ? raw.slice(0, CODE_LENGTH) : extractCode(raw));
        }}
        onPaste={(event) => {
          const pasted = extractCode(event.clipboardData.getData('text'));
          event.preventDefault();
          if (!pasted) return;
          // A whole code replaces what is there; a fragment continues it.
          commit(pasted.length === CODE_LENGTH ? pasted : (value + pasted).slice(0, CODE_LENGTH));
        }}
        onFocus={(event) => {
          setFocused(true);
          keepCaretAtEnd(event.currentTarget);
        }}
        onBlur={() => setFocused(false)}
        onSelect={(event) => keepCaretAtEnd(event.currentTarget)}
        className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
      />

      <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = value[index];
          // The box the next digit goes into — or the last one, once full.
          const active = focused && index === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <div
              key={index}
              className={cn(
                'flex h-14 items-center justify-center rounded-xl border bg-background text-2xl font-semibold tabular-nums text-foreground shadow-xs transition-[border-color,box-shadow] duration-150',
                invalid
                  ? 'border-destructive ring-2 ring-destructive/20'
                  : active
                    ? 'border-primary ring-2 ring-primary/25'
                    : digit
                      ? 'border-foreground/30'
                      : 'border-input',
                disabled && 'opacity-60',
              )}
            >
              {digit ??
                (active && !disabled ? (
                  <span className="h-7 w-px animate-pulse bg-foreground" />
                ) : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
});
