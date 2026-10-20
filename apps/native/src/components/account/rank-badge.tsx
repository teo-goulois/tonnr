import type { Rank } from "@repo/client/viewer/types";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
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

/** The rank an account reached, by its initials on the theme's muted ground; its name is said. */
export function RankBadge({ rank }: { rank: Rank }) {
  const { colors, space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={m.rank_label({ name: rankName(rank) })}
      style={{
        paddingHorizontal: space.xs,
        paddingVertical: 2,
        borderRadius: 9999,
        backgroundColor: colors["neutral-3"],
      }}
    >
      <Text size="xs" weight="medium" numeric dense>
        {RANKS[rank].short()}
      </Text>
    </View>
  );
}
