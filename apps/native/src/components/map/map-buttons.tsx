import { ListsIcon, LocateIcon, SearchIcon } from "@repo/ui/icon";
import { View } from "react-native";

import { IconButton } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// The map's buttons, a column at the bottom right where the thumb is (decision 040), which grows
// up from the one that finds the reader: the search over it, and the account's lists last, so
// that no other button moves when the lists are known. The lists' button is filled while the map
// shows one list alone, so that a folded row still says that the map does not show everything.

type MapButtonsProps = {
  isLocating: boolean;
  located: boolean;
  onLocate: () => void;
  onSearch: () => void;
  // None for a visitor, or an account without lists.
  lists?: {
    open: boolean;
    // The name of the list shown alone, if one is.
    showing: string | undefined;
    onToggle: () => void;
  };
};

export function MapButtons({ isLocating, located, onLocate, onSearch, lists }: MapButtonsProps) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs, alignItems: "center" }}>
      {lists ? (
        <IconButton
          icon={ListsIcon}
          // Filled while the map shows one list alone, as the chip of that list is.
          variant={lists.showing ? "inverse" : "surface"}
          label={lists.showing ? m.lists_showing({ name: lists.showing }) : m.lists_filter()}
          expanded={lists.open}
          onPress={() => {
            feel("select");
            lists.onToggle();
          }}
        />
      ) : null}
      <IconButton icon={SearchIcon} variant="surface" label={m.search_open()} onPress={onSearch} />
      <IconButton
        icon={LocateIcon}
        variant="surface"
        label={m.locate_me()}
        selected={located}
        loading={isLocating}
        onPress={onLocate}
      />
    </View>
  );
}
