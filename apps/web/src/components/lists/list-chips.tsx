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
  // The row floats on the map, where each chip has the theme's surface, in place of standing in
  // a panel, whose edges it then reaches.
  onMap?: boolean;
  className?: string;
};

const base = cn(
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
// A chip that floats on the map: the theme's surface with its edge, as the map's buttons have.
const floating = cn(
  "edge-inset h-9 bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)]",
  "aria-pressed:[--edge-color:transparent]",
);

/**
 * The lists of an account, one press away: a chip shows a list alone, in the panel and on the
 * map, and the first one shows everything again. A row that is longer than its place scrolls.
 * The saved panel has the row, and so has the map, where it floats: decision 040.
 */
export function ListChips({ lists, joined, current, onPick, onMap, className }: ListChipsProps) {
  if (lists.length + joined.length === 0) return null;
  const chip = cn(base, onMap && floating);

  return (
    <div
      role="group"
      aria-label={m.lists_filter()}
      className={cn(
        "flex gap-xs overflow-x-auto [scrollbar-width:none]",
        // The row goes to the panel's edges, so that a chip cut by one says that more follow.
        !onMap && "-mx-m px-m",
        className,
      )}
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
