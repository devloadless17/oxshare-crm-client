import * as React from 'react';

/**
 * An inline run that must read left to right whatever the page's direction —
 * an amount, an account number, an email, a phone number, an IBAN, an address
 * or a code shown inside Arabic text. `<bdi dir="ltr">` isolates it, so bidi
 * can neither reorder its parts (`-$5.00` → `$5.00-`) nor let it disturb the
 * Arabic around it. Inline, so it never changes how its parent is ALIGNED.
 *
 * For text that goes where markup cannot (a `t()` placeholder, a toast, an
 * attribute) use `ltr()` from `lib/bidi`.
 */
export function Ltr({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
