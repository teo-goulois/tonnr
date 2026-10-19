import { Badge } from "@repo/ui/components/ui/badge";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@repo/ui/components/ui/menu";

import { m } from "@/paraglide/messages.js";

import type { Rank } from "../viewer/types";
import { RANKS } from "./guide-words";

/** The rank an account reached, by the initials of its tour. Its name is said to who asks. */
export function RankBadge({ rank }: { rank: Rank }) {
  const name = RANKS[rank].name();
  return (
    <Badge title={name} aria-label={m.rank_label({ name })} className="tabular-nums">
      {RANKS[rank].short()}
    </Badge>
  );
}

/**
 * Who wrote a line of a guide: a username and a rank, and nothing else of the account. A line
 * whose author is gone, has no username, or was blocked by the reader, is a contributor's. With
 * `onBlock`, the name opens a menu that blocks the account: decision 071.
 */
export function Author({
  by,
  onBlock,
}: {
  by: { username: string; rank: Rank | null } | null;
  onBlock?: ((username: string) => void) | undefined;
}) {
  if (!by) return <span>{m.guide_by_nobody()}</span>;
  const name = (
    <span className="inline-flex items-center gap-xxs">
      <span>@{by.username}</span>
      {by.rank && <RankBadge rank={by.rank} />}
    </span>
  );
  if (!onBlock) return name;
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={m.guide_author_menu({ username: by.username })}
            className="focus-ring cursor-pointer rounded-(--radius-xs) outline-none hover:text-neutral-10"
          />
        }
      >
        {name}
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-48">
        <MenuItem variant="destructive" onClick={() => onBlock(by.username)}>
          {m.block_account({ username: by.username })}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
