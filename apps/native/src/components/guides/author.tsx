import type { Rank } from "@repo/client/viewer/types";
import { Pressable, View } from "react-native";

import { RankBadge } from "@/components/account/rank-badge";
import { Text } from "@/components/ui/text";
import { TARGET } from "@/components/ui/metrics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { authorName } from "./guide-words";

/**
 * Who wrote a line of a guide: a username and a rank, and nothing else of the account. A line
 * whose author is gone, has no username, or was blocked by the reader, is a contributor's. With
 * `onBlock`, a press on the name asks whether to block the account: decision 071. Under the row
 * of a line, `under` keeps its target below the name, all of it, so that it takes no press from
 * the line it stands under.
 */
export function Author({
  by,
  onBlock,
  under = false,
}: {
  by: { username: string; rank: Rank | null } | null;
  onBlock?: ((username: string) => void) | undefined;
  under?: boolean;
}) {
  const { space } = useTheme();
  const name = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <Text size="s" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {authorName(by)}
      </Text>
      {by?.rank ? <RankBadge rank={by.rank} /> : null}
    </View>
  );
  if (!by || !onBlock) return name;
  const slop = Math.max(0, Math.ceil((TARGET - 20) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.guide_author_menu({ username: by.username })}
      accessibilityHint={m.block_account({ username: by.username })}
      hitSlop={{
        top: under ? 0 : slop,
        bottom: under ? 2 * slop : slop,
        left: space.xs,
        right: space.xs,
      }}
      onPress={() => onBlock(by.username)}
      style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}
    >
      {name}
    </Pressable>
  );
}
