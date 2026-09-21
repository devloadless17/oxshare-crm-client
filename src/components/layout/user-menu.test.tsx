import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '@/test/render';
import { UserMenu } from './user-menu';

/*
 * The rules worth pinning here, in rising order of cost-to-break:
 *  1. The header trigger is the AVATAR ALONE, and still announces itself. It
 *     was a pill carrying the name; the name moved into the menu, so what is
 *     at risk now is the accessible name the visible text used to supply.
 *  2. A FAILED sign-out keeps the menu open with the error visible inside it,
 *     and never pretends the session ended. The old inline-under-the-trigger
 *     alert died with the sidebar placement; this is its replacement, so only
 *     this file notices if it vanishes.
 */

const logout = vi.fn();
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({
    user: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'client@oxshare.com',
      avatarUrl: null,
    },
    logout,
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

beforeEach(() => logout.mockReset());

describe('the header account menu', () => {
  /*
   * THE TRIGGER IS THE AVATAR, and nothing else.
   *
   * It used to be a pill carrying the name and a chevron from `md` up. The
   * name moved out of the header entirely — it is the first thing inside the
   * menu, which the next case asserts, so the identity is one click away
   * rather than permanently occupying header width.
   *
   * What has to survive the change is the ACCESSIBLE NAME: the visible text
   * was providing it incidentally, so a trigger stripped to an image would
   * announce as an unlabelled button without the `aria-label`.
   */
  it('is the avatar alone, and still announces itself', () => {
    render(<UserMenu collapsed variant="header" />);
    const trigger = screen.getByRole('button', { name: /account menu/i });

    expect(trigger).not.toHaveTextContent('John Doe');
    // The fallback initials live inside the avatar, so the trigger is not empty
    // of text — what it must not carry is the NAME beside it.
    expect(trigger).toBeInTheDocument();
  });

  it('opens downward with Profile, Theme and Log out', async () => {
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));

    expect(await screen.findByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    // The identity repeats inside — the shared-device check.
    expect(screen.getByText('client@oxshare.com')).toBeInTheDocument();
  });

  /*
   * `Theme ▸` expands IN PLACE — the regression this pins.
   *
   * As a `DropdownMenuSub` it opened a second panel to the SIDE of a menu
   * already anchored to the right edge of the header. At 393px there is no room
   * there, so Radix flipped it left and it hung off the parent over the page
   * content. The three options arriving in the SAME menu is what makes that
   * impossible to reintroduce, and `queryByRole('menu')` staying at one panel is
   * how this test can tell "expanded below" from "flew out beside".
   *
   * Asserting them as `menuitemradio` also pins that the control is still a
   * radio group rather than three loose buttons.
   */
  it('expands Light, Dark and System into the same menu', async () => {
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));

    const theme = await screen.findByRole('menuitem', { name: /theme/i });
    // Collapsed to start with, exactly as the submenu row was.
    expect(theme).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();

    await user.click(theme);

    for (const name of [/^light$/i, /^dark$/i, /^system$/i]) {
      expect(await screen.findByRole('menuitemradio', { name })).toBeInTheDocument();
    }
    // One panel, not two: the options are rows in the menu that was already open.
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('a failed sign-out keeps the menu open and says so INSIDE it', async () => {
    logout.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    // Still open (the item did not dismiss), and the alert is in the menu.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/still signed in/i);
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  it('a successful sign-out closes the menu and renders no error', async () => {
    logout.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<UserMenu collapsed variant="header" />);
    await user.click(screen.getByRole('button', { name: /account menu/i }));
    await user.click(screen.getByRole('menuitem', { name: /log out/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
