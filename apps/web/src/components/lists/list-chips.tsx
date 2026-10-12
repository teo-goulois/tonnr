import { cn } from "@repo/ui/lib/utils";
import { ShareIcon } from "@repo/ui/icon";

import { m } from "@/paraglide/messages.js";

import { listName } from "../viewer/station-actions";

/** A list as the row of chips names it. */
type Chip = { id: string; name: string; isDefault: boolean };

type ListChipsProps = {
  // The account's own lists, then those of others that it kept.
  lists: Chip[];
  joined: Chip[];
  // The list the map shows alone. Undefined while it shows everything.
  current: string | undefined;
  // Shows a list alone, in the panel and on the map, or everything again.
  onPick: (listId: string | undefined) => void;
};

const chip = cn(
  // structure & layout
  "inline-flex h-8 shrink-0 items-center gap-xxs rounded-full px-s",
  // typography
  "text-s font-medium whitespace-nowrap text-neutral-7",
  // border & background
  "bg-neutral-3-transparent",
  // focus
  "focus-ring cursor-pointer outline-none",
  // transitions
  "transition-colors duration-(--motion-duration) ease-theme",
  // state: hover and the one in view
  "hover:text-neutral-10 aria-pressed:bg-neutral-10 aria-pressed:text-neutral-1",
);

/**
 * The lists of an account, one press away: a chip shows a list alone, in the panel and on the
 * map, and the first one shows everything again. A row that is longer than the panel scrolls.
 */
export function ListChips({ lists, joined, current, onPick }: ListChipsProps) {
  if (lists.length + joined.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={m.lists_filter()}
      // The row goes to the panel's edges, so that a chip cut by one says that more follow.
      className="-mx-m flex gap-xs overflow-x-auto px-m [scrollbar-width:none]"
    >
      <button
        type="button"
        className={chip}
        aria-pressed={current === undefined}
        onClick={() => onPick(undefined)}
      >
        {m.lists_all()}
      </button>
      {lists.map((list) => (
        <button
          key={list.id}
          type="button"
          className={chip}
          aria-pressed={current === list.id}
          onClick={() => onPick(list.id)}
        >
          {listName(list)}
        </button>
      ))}
      {joined.map((list) => (
        <button
          key={list.id}
          type="button"
          className={chip}
          aria-pressed={current === list.id}
          onClick={() => onPick(list.id)}
        >
          <ShareIcon aria-hidden className="size-3.5" />
          <span className="sr-only">{m.list_alone_shared()}</span>
          {listName(list)}
        </button>
      ))}
    </div>
  );
}
