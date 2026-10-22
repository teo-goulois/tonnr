import type { Rank } from "@repo/client/viewer/types";

import { Badge } from "@/components/ui/badge";
import { m } from "@/paraglide/messages";

// The ranks an account reaches in the guides, by the initials of a tour and their names, as the
// web writes them: decision 041.
const RANKS: Record<Rank, { short: () => string; name: () => string }> = {
  qs: { short: m.rank_qs, name: m.rank_qs_name },
  cs: { short: m.rank_cs, name: m.rank_cs_name },
  ct: { short: m.rank_ct, name: m.rank_ct_name },
};

/** The name of a rank: "Qualifying Series". */
export const rankName = (rank: Rank) => RANKS[rank].name();
/** A rank by its initials, as its badge writes it: "QS". */
export const rankInitials = (rank: Rank) => RANKS[rank].short();

/** The rank an account reached, by its initials on the theme's badge, as the web's; its name is said. */
export function RankBadge({ rank }: { rank: Rank }) {
  return (
    <Badge accessibilityLabel={m.rank_label({ name: rankName(rank) })}>{RANKS[rank].short()}</Badge>
  );
}
