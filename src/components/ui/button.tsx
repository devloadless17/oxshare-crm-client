// NO LONGER A TWIN, and the header saying it was is why this note replaces it.
//
// It diverged from admin's copy twice, deliberately: the scale-on-press was
// removed here alone (press feedback in the client portal is colour only), and
// `loading` below pulls in `components/ui/loader`, which is a portal component.
// `scripts/check-twins.sh` records both and no longer compares this file.
//
// The SHAPE is still meant to match — variants, sizes, `asChild`, the props
// interface — so a new variant belongs in both by hand.

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/loader';

const buttonVariants = cva(
  /*
   * There is NO press transform here, and there must not be one added back to a
   * single button either. A scale-on-press used to live on this base class and
   * on a handful of hand-rolled controls that were not `<Button>`; the two never
   * agreed on how far to scale, so the same gesture moved different controls by
   * different amounts on the same screen. Every control in this product now
   * responds to press by colour alone.
   *
   * `transition-colors` and NOT `transition-all`: hover here only ever changes a
   * background, and animating layout properties on a control that is pressed
   * constantly is the cheapest way to make an interface feel slow on a
   * mid-range phone.
   */
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-link underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * The button is waiting on something it started.
   *
   * Handles the whole state rather than just drawing a spinner: it DISABLES the
   * button and sets `aria-busy`. Every call site was doing the first of those by
   * hand and none was doing the second, so a double-click filed two withdrawals
   * on any screen whose author forgot — and `Idempotent` on the API is the last
   * line of defence for that, not the first.
   *
   * The label stays put. Swapping "Sign in" for "Signing in…" resizes the button
   * under the pointer that is still travelling toward it, and on a slow request
   * that is a real mis-click. Pass different children if a screen genuinely
   * needs different words.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    /*
     * `asChild` and `loading` cannot combine, and this is why rather than an
     * oversight. Slot requires EXACTLY ONE child — injecting a spinner beside
     * the caller's element gives it two and React throws. `asChild` is used
     * here for links (`<Button asChild><Link/></Button>`), and a navigation has
     * nothing to wait on: it either happens or it does not. So the prop is
     * ignored in that combination rather than crashing the screen.
     */
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        /*
         * Disabled BY the loading state, not merely alongside it. A button that
         * shows a spinner and still accepts clicks is the double-submit bug
         * wearing the costume of its own fix.
         *
         * `||`, NOT `??` — and the difference is the whole bug this line once
         * had. Nullish coalescing only falls back when `disabled` is null or
         * undefined, so a caller passing a computed condition kept control of
         * the value forever: `disabled={!amount}` is `false` the moment the form
         * is valid, and `false ?? loading` is `false`. Every submit button on
         * the money screens showed a spinner and stayed clickable, which is
         * precisely what the sentence above says must not happen.
         *
         * With `||` the two reasons a button can be unavailable are ORed, which
         * is what "and also disabled while loading" means.
         */
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Inherits the button's foreground through `currentColor`, so it is
            legible on primary, destructive, outline and ghost alike without
            any call site choosing a colour. `[&_svg]:size-4` in the base class
            sizes it. */}
        {loading && <Spinner />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
