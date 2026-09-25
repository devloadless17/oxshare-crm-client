import { PortalLayout } from '@/components/layout/portal-layout';

/**
 * ONE frame for every signed-in page — the sidebar, the header, the bell.
 *
 * Each section used to wrap its own `<PortalLayout>` in its own `layout.tsx`.
 * Sibling layouts are separate trees, so every move between sections — the
 * dashboard to the wallet, the wallet to a statement — unmounted the whole frame
 * and mounted a new one: the sidebar forgot that it had been collapsed and came
 * back expanded on the next click, a menu opened while a page loaded was
 * dropped when it landed, and the session check and the notification bell
 * started over on every page. Found by a live check that tagged the sidebar's
 * element, navigated, and found a different element there.
 *
 * A route group changes no URL. The sections' own `layout.tsx` files stay, for
 * their `metadata` only — their pages are client components and cannot export
 * it themselves.
 *
 * `/kyc` stays outside: its layout picks the frame from the path (the wizard at
 * `/kyc/step/*` has none), which a group that always draws one cannot do.
 */
export default function PortalGroupLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
