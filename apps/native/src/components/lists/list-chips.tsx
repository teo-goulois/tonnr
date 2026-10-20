import { ShareIcon } from "@repo/ui/icon";

import { Chip, ChipRow } from "@/components/ui/chip";
import { m } from "@/paraglide/messages";

import type { ChipList } from "./items";

/**
 * The lists of an account, one press away, as the web's `ListChips` has them: a chip shows a
 * list alone, and the first one shows everything again. A list of someone else's that the
 * account kept carries the sign of a shared one. A row longer than the screen scrolls. Nothing
 * is drawn for an account that has no list.
 */
export function ListChips({
  lists,
  current,
  onPick,
  bleed,
}: {
  lists: readonly ChipList[];
  /** The list shown alone, or undefined while everything is. */
  current: string | undefined;
  onPick: (listId: string | undefined) => void;
  /** The room of what holds the row, which it crosses to the screen's edges. */
  bleed: number;
}) {
  if (lists.length === 0) return null;
  return (
    <ChipRow label={m.lists_filter()} bleed={bleed}>
      <Chip
        label={m.lists_all()}
        selected={current === undefined}
        onPress={() => onPick(undefined)}
      />
      {lists.map((list) => (
        <Chip
          key={list.id}
          label={list.name}
          selected={current === list.id}
          onPress={() => onPick(list.id)}
          icon={list.shared ? ShareIcon : undefined}
          iconLabel={list.shared ? m.list_alone_shared() : undefined}
        />
      ))}
    </ChipRow>
  );
}
