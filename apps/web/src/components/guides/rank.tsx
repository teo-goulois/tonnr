import { Badge } from "@repo/ui/components/ui/badge";

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
 * whose author is gone, or has no username, is a contributor's.
 */
export function Author({ by }: { by: { username: string; rank: Rank | null } | null }) {
  if (!by) return <span>{m.guide_by_nobody()}</span>;
  return (
    <span className="inline-flex items-center gap-xxs">
      <span>@{by.username}</span>
      {by.rank && <RankBadge rank={by.rank} />}
    </span>
  );
}
