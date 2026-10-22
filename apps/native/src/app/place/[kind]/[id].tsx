import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { PlaceSheet } from "@/components/place/place-sheet";
import { isPlaceKind } from "@/components/place/tabs";
import { Text } from "@/components/ui/text";
import { m } from "@/paraglide/messages";

/** A place, as a sheet over the map: a surf break, a station or a spot of the account's own, `/place/<break|station|spot>/<id>?tab=forecast|guide|reports|sessions|alerts`, and `&new=1` for a spot just added. Decisions 006, 040 and 069. */
export default function Screen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; tab?: string; new?: string }>();
  const { kind, id, tab } = params;
  if (!isPlaceKind(kind) || !id) {
    return (
      <View className="flex-1 bg-background p-l">
        <Text tone="muted">{m.spot_not_found()}</Text>
      </View>
    );
  }
  // Another place starts at its top, with its own charts.
  return (
    <PlaceSheet
      key={`${kind}:${id}`}
      kind={kind}
      id={id}
      askedTab={tab}
      isNew={params.new === "1"}
    />
  );
}
