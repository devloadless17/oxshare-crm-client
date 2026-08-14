'use client';

import { MethodTile } from '@/components/money/money-shell';

/**
 * A choice between things of DIFFERENT KINDS, as labelled blocks of tiles.
 *
 * ## Why not a select
 *
 * Every money flow asks a question of this shape — which wallet, which account,
 * which rail — and a `<select>` answers it worst: the options are hidden until
 * the client opens it, each one is a line of text, and the balance beside a
 * choice has nowhere to go. Tiles show the whole set with its figures, which is
 * what somebody deciding where money should land actually needs.
 *
 * ## Why the groups are labelled
 *
 * A wallet and a trading account are different objects with different rules —
 * one holds money you can withdraw, the other money you can trade. One
 * unlabelled list asks the client to tell them apart by the shape of the name on
 * each tile. Naming the groups says it once.
 *
 * An empty group is not rendered: a heading with nothing under it promises
 * something that is not there. The separator belongs to the group BELOW it, so
 * it disappears with that group rather than leaving a hairline marking a section
 * that does not exist.
 *
 * Shared by /transfer and /deposit so the two screens ask this question in the
 * same shape — the second one having previously asked it with a dropdown.
 */
export interface TileOption {
  /** Stable value handed back to `onSelect`. */
  key: string;
  title: string;
  /** Usually a balance. Rendered small, under the title. */
  hint?: string;
  /**
   * Selectable but pointless — shown WITH its reason rather than hidden. A
   * wallet holding nothing is a fact about the account; hiding it leaves the
   * client hunting for a currency they know they have.
   */
  disabled?: boolean;
}

export interface TileGroup {
  label: string;
  options: TileOption[];
}

export function TileGroups({
  name,
  groups,
  selected,
  onSelect,
  disabled,
}: {
  /** Radio group name — one per screen, so two pickers cannot collide. */
  name: string;
  groups: TileGroup[];
  selected: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
}) {
  const populated = groups.filter((group) => group.options.length > 0);

  return (
    <div className="space-y-4">
      {populated.map((group, index) => (
        <div key={group.label} className={index > 0 ? 'border-t border-border pt-4' : undefined}>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {group.label}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.options.map((option) => (
              <MethodTile
                key={option.key}
                name={name}
                value={option.key}
                checked={selected === option.key}
                onChange={onSelect}
                title={option.title}
                disabled={disabled || option.disabled}
                badge={
                  option.hint ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
