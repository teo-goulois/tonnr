import type { JoinedList, SavedList } from "@repo/client/viewer/types";
import { ShareIcon } from "@repo/ui/icon";
import { ScrollView } from "react-native";
import Animated, { FadeInRight, FadeOutRight } from "react-native-reanimated";

import { Chip } from "@/components/ui/chip";
import { TARGET } from "@/components/ui/metrics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// The account's lists on the map itself (decision 040): a row of chips that a button of the map
// unfolds beside it. A chip shows a list alone on the map and opens nothing else, and the first
// one shows everything again. The web's `ListChips`, floating. A row shorter than its room stands
// against the button; a longer one scrolls, cut where more follow.

/** What a list is called: its own name, or the favorites'. */
export function listName(list: Pick<SavedList, "name" | "isDefault">) {
  return list.isDefault ? m.saved_favorites() : list.name;
}

type ListChipsProps = {
  lists: readonly SavedList[];
  joined: readonly JoinedList[];
  // The list the map shows alone, or none when it shows everything.
  current: string | undefined;
  onPick: (id: string | undefined) => void;
};

export function MapListChips({ lists, joined, current, onPick }: ListChipsProps) {
  const { space } = useTheme();
  return (
    <Animated.View entering={FadeInRight} exiting={FadeOutRight} style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        role="group"
        accessibilityLabel={m.lists_filter()}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-end",
          gap: space.xs,
          minHeight: TARGET,
          alignItems: "center",
          paddingHorizontal: space.xxs,
        }}
      >
        <Chip
          floating
          label={m.lists_all()}
          selected={current === undefined}
          onPress={() => onPick(undefined)}
        />
        {lists.map((list) => (
          <Chip
            key={list.id}
            floating
            label={listName(list)}
            selected={current === list.id}
            onPress={() => onPick(list.id)}
          />
        ))}
        {joined.map((list) => (
          <Chip
            key={list.id}
            floating
            label={listName(list)}
            selected={current === list.id}
            onPress={() => onPick(list.id)}
            icon={ShareIcon}
            iconLabel={m.list_alone_shared()}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}
