'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { KycGateDialog } from '@/components/kyc/kyc-gate-dialog';
import { useKycAccess } from '@/hooks/use-kyc-access';

/**
 * A control that moves money: a link when the client is cleared for it, and an
 * explanation of how to get cleared when they are not.
 *
 * ## One component, because there are three entry points
 *
 * Deposit, Withdraw and Transfer are reachable from /wallet and from the
 * dashboard, which is five buttons across two screens that must all make the
 * same decision. They did not: the wallet's were `<Link>`s with one hand-written
 * class string and the dashboard's were `<Link>`s with a slightly different one,
 * and neither knew anything about verification. Whoever adds the sixth gets the
 * behaviour for free by reaching for this.
 *
 * ## Both branches render the same button
 *
 * A control styled differently depending on whether it will work reads as two
 * different features, and the client cannot tell which of them is the broken
 * one. The appearance says "this is Deposit"; the click says what happens next.
 *
 * `asChild` on the cleared branch keeps a real `<a>` underneath, so these stay
 * middle-clickable and openable in a new tab — the reason they stopped being
 * `<button>` elements originally, which is not being given back.
 *
 * ## Blocked until proven approved
 *
 * Including while the status is still loading. The two failure modes are not
 * symmetric: prompting someone who turns out to be approved costs one extra
 * click, while letting an unapproved client through lands them on a form the
 * payments API refuses only after they have filled it in.
 *
 * This is NOT the enforcement. `RequireAuth` bounces the same client off
 * /deposit and /withdraw on arrival and the API refuses them regardless — see
 * `lib/kyc-access.ts`. This is the half that explains it first.
 *
 * ## `icon` is a NAME, not a component
 *
 * This is a Client Component and `/dashboard` is a SERVER one — it exports
 * `metadata`, which only a server component may do. A React component is a
 * function, and functions cannot cross that boundary: passing
 * `icon={ArrowDownRight}` from the dashboard threw
 *
 *   "Only plain objects can be passed to Client Components from Server
 *    Components. Classes or other objects with methods are not supported."
 *
 * and it threw only from the dashboard, because /wallet is `'use client'` and
 * has no boundary to cross. A string does cross, so the mapping lives here.
 *
 * That also keeps `h-4 w-4` in ONE place. Taking a rendered `<ArrowDownRight />`
 * as a prop would fix the serialisation just as well and would push the
 * className back out to all six call sites — recreating exactly the
 * "slightly different hand-written class string" this component was extracted
 * to remove.
 */
const ICONS = {
  deposit: ArrowDownRight,
  withdraw: ArrowUpRight,
  transfer: ArrowRightLeft,
} as const;

/** A closed set, so a typo is a compile error rather than a missing icon. */
export type MoneyActionIcon = keyof typeof ICONS;

export function MoneyAction({
  href,
  icon,
  label,
  variant = 'default',
  size = 'default',
  className,
}: {
  href: string;
  icon: MoneyActionIcon;
  label: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const Icon = ICONS[icon];
  const kyc = useKycAccess();
  const [gateOpen, setGateOpen] = React.useState(false);

  const blocked = !kyc.approved;

  return (
    <>
      {blocked ? (
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={() => setGateOpen(true)}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      ) : (
        <Button asChild variant={variant} size={size} className={className}>
          <Link href={href}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        </Button>
      )}

      {/*
        Mounted per action rather than once per screen. Radix renders nothing
        until `open`, so the cost of the closed ones is a boolean each — and it
        buys the component the property that makes it reusable: it works
        wherever it is dropped, with no wiring at the page level to remember.
      */}
      <KycGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        pending={kyc.pending}
        rejected={kyc.rejected}
      />
    </>
  );
}
