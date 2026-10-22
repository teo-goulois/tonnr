import type { JoinedList } from "@repo/client/viewer/types";
import { Pressable, View } from "react-native";

import { listName } from "@/components/lists/items";
import { FoundMark } from "@/components/search/found-list";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { SectionHeader } from "./place-section";

// The lists of others that the account opened by their link and kept, as the web's saved panel
// lists them: each a row of the map's sign, its name and how many places it holds, which shows
// that list alone, as its chip does. Nothing is drawn while there is none.

export function JoinedLists({
  lists,
  onPick,
}: {
  lists: readonly JoinedList[];
  onPick: (listId: string) => void;
}) {
  const { colors, space, radius } = useTheme();
  if (lists.length === 0) return null;
  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader title={m.lists_joined()} />
      <View style={{ marginHorizontal: -space.xs, gap: space.xxs }}>
        {lists.map((list) => {
          const name = listName(list);
          return (
            <Pressable
              key={list.id}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${list.size}`}
              onPress={() => onPick(list.id)}
              style={({ pressed }) => ({
                minHeight: TARGET,
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                paddingHorizontal: space.xs,
                borderRadius: radius.xs,
                borderCurve: "continuous",
                backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
              })}
            >
              <FoundMark kind="list" small />
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {name}
              </Text>
              <Text size="s" tone="muted" numeric>
                {list.size}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
